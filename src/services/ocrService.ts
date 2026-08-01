/**
 * src/services/ocrService.ts
 *
 * Browser-side OCR pipeline.
 *
 * Flow:
 *   File → preprocessScreenshot() → per-region OCR.Space calls → merge → clean → extractClaim()
 *
 * When preprocessing detects a known platform (Facebook, etc.):
 *   - The image is cropped into content regions (caption, embedded image).
 *   - Each region is sent to OCR.Space separately.
 *   - Results are merged in reading order and deduplicated.
 *   - This skips the header, footer, reaction bar, and sidebar — the main
 *     sources of noise in social media screenshots.
 *
 * When no platform is detected (generic image, article screenshot, etc.):
 *   - The original file is sent to OCR.Space as-is (same as before).
 *
 * Timing:
 *   Every step is measured. The console prints a comparison table showing
 *   preprocessing time vs. OCR time so we can evaluate whether cropping
 *   actually reduces the total wall-clock time.
 *
 * WHY BROWSER-SIDE?
 *   OCR.Space (api.ocr.space) is proxied by Cloudflare. Calling it from a
 *   Cloudflare Worker triggers an "internal error" at the CF edge before the
 *   request even reaches OCR.Space. The browser has no such constraint.
 */

import { cleanOCRText }         from "@/utils/ocrCleanup";
import { extractClaim }         from "@/utils/claimExtractor";
import { preprocessScreenshot } from "@/utils/screenshotPreprocessor";
import type { CroppedRegion }   from "@/utils/screenshotPreprocessor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OCRServiceResult {
  success:        boolean;
  suggestedClaim: string;
  claimScore:     number;
  /** Full cleaned OCR text — shown to the user for review/edit. */
  text:           string;
  error?:         string;
}

interface OCRSpaceParsedResult {
  FileParseExitCode: number;
  ParsedText:        string;
  ErrorMessage?:     string;
}

interface OCRSpaceResponse {
  ParsedResults?:                OCRSpaceParsedResult[];
  OCRExitCode:                   number;
  IsErroredOnProcessing:         boolean;
  ErrorMessage?:                 string | string[];
  ProcessingTimeInMilliseconds?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OCR_API_URL = "https://api.ocr.space/parse/image";

const API_KEY: string =
  (import.meta.env.VITE_OCR_SPACE_API_KEY as string | undefined) ?? "";

export const OCR_MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB — OCR.Space free tier

export const OCR_ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

// ── Low-level OCR.Space call ──────────────────────────────────────────────────

interface SingleOCRResult {
  text:            string;
  processingTimeMs: number;
  error?:          string;
}

/**
 * Send a single Blob to OCR.Space and return the raw extracted text.
 * Used for both full-image OCR and per-region OCR.
 *
 * @param blob     Image data to OCR (JPEG preferred for size).
 * @param label    Short name for logging ("full-image", "caption", etc.).
 * @param ext      File extension hint sent to OCR.Space ("JPG", "PNG", "WEBP").
 */
async function callOCRSpace(
  blob: Blob,
  label: string,
  ext: string,
): Promise<SingleOCRResult> {
  const t = performance.now();

  const form = new FormData();
  form.append("file",              blob, `${label}.${ext.toLowerCase()}`);
  form.append("language",          "eng");
  form.append("OCREngine",         "1");      // Tesseract — fastest for printed text
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "true");
  form.append("scale",             "true");
  form.append("filetype",          ext.toUpperCase());

  let response: Response;
  try {
    response = await fetch(OCR_API_URL, {
      method:  "POST",
      headers: { apikey: API_KEY },
      body:    form,
    });
  } catch (err) {
    return {
      text: "",
      processingTimeMs: performance.now() - t,
      error: `Network error (${label}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const elapsed = performance.now() - t;

  // Guard: if OCR.Space returns HTML it means the key is invalid, quota is
  // exceeded, or the endpoint redirected. Parsing HTML as JSON throws the
  // "Unexpected token '<'" error seen in the UI.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const bodyPreview = await response.text().catch(() => "");
    const isQuota    = bodyPreview.toLowerCase().includes("quota") ||
                       bodyPreview.toLowerCase().includes("limit");
    const isAuthErr  = response.status === 401 || response.status === 403 ||
                       bodyPreview.toLowerCase().includes("api key") ||
                       bodyPreview.toLowerCase().includes("unauthorized");
    const hint = isQuota
      ? "OCR.Space monthly quota exceeded. Get a new free key at https://ocr.space/ocrapi/freekey"
      : isAuthErr
      ? "OCR.Space rejected the API key. Check VITE_OCR_SPACE_API_KEY in your .env file."
      : `OCR.Space returned an unexpected response (HTTP ${response.status}). The API key may be invalid or quota exceeded.`;
    return { text: "", processingTimeMs: elapsed, error: hint };
  }

  let data: OCRSpaceResponse;
  try {
    data = (await response.json()) as OCRSpaceResponse;
  } catch {
    return {
      text: "",
      processingTimeMs: elapsed,
      error: `Non-JSON response (${label}): HTTP ${response.status}`,
    };
  }

  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(" ")
      : (data.ErrorMessage ?? "Unknown OCR error");
    return { text: "", processingTimeMs: elapsed, error: `OCR error (${label}): ${msg}` };
  }

  const text = (data.ParsedResults ?? [])
    .map((p) => p.ParsedText ?? "")
    .join("\n")
    .trim();

  const serverMs = data.ProcessingTimeInMilliseconds
    ? parseInt(data.ProcessingTimeInMilliseconds, 10)
    : 0;

  console.info(
    `[OCR] ${label}: ${elapsed.toFixed(0)}ms total` +
    (serverMs ? ` (server ${serverMs}ms, upload ~${Math.max(0, elapsed - serverMs).toFixed(0)}ms)` : "") +
    ` — ${(blob.size / 1024).toFixed(1)} KB — ${text.length} chars`,
  );

  return { text, processingTimeMs: elapsed };
}

// ── Text merger ───────────────────────────────────────────────────────────────

/**
 * Merge OCR results from multiple regions in reading order.
 *
 * Deduplication strategy:
 *   - Exact duplicate lines (case-insensitive, normalised whitespace) are removed.
 *   - We keep the first occurrence, preserving the original wording.
 *   - Lines that are strict substrings of an already-seen line are also dropped
 *     (OCR.Space sometimes returns the same sentence twice when regions overlap).
 */
function mergeRegionTexts(texts: string[]): string {
  const allLines: string[] = [];

  for (const text of texts) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    allLines.push(...lines);
  }

  const seen: string[] = [];

  for (const line of allLines) {
    const norm = line.toLowerCase().replace(/\s+/g, " ");

    // Skip exact duplicates
    if (seen.some((s) => s === norm)) continue;

    // Skip lines that are a substring of something already kept
    if (seen.some((s) => s.includes(norm) && s.length > norm.length)) continue;

    // Remove already-kept lines that are substrings of this new (longer) line
    const dominated = seen.filter((s) => norm.includes(s) && norm.length > s.length);
    for (const d of dominated) {
      const idx = seen.indexOf(d);
      if (idx !== -1) seen.splice(idx, 1);
    }

    seen.push(norm);
  }

  // Reconstruct in original wording by finding the first original line
  // that normalises to each kept entry
  return allLines
    .filter((line) => {
      const norm = line.toLowerCase().replace(/\s+/g, " ");
      return seen.includes(norm);
    })
    .filter((line, idx, arr) => arr.indexOf(line) === idx) // preserve first occurrence
    .join("\n");
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * extractTextFromImageBrowser
 *
 * Full OCR pipeline:
 *   1. Validate file.
 *   2. Preprocess: detect platform, crop content regions.
 *   3. OCR each region (or the full image if no platform detected).
 *   4. Merge + deduplicate text across regions.
 *   5. Clean text (ocrCleanup) and extract best claim (claimExtractor).
 *   6. Log a timing comparison table.
 *
 * Always resolves — never throws.
 */
export async function extractTextFromImageBrowser(
  file: File,
): Promise<OCRServiceResult> {
  const T_START = performance.now();

  // ── 0. Guard: API key ─────────────────────────────────────────────────────
  if (!API_KEY) {
    return {
      success: false, suggestedClaim: "", claimScore: 0, text: "",
      error: "OCR API key not configured. Add VITE_OCR_SPACE_API_KEY to your .env file.",
    };
  }

  // ── 1. Validate ───────────────────────────────────────────────────────────
  const mime = file.type.toLowerCase();
  if (!(OCR_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return {
      success: false, suggestedClaim: "", claimScore: 0, text: "",
      error: `Unsupported format "${file.type}". Please upload JPG, PNG, or WebP.`,
    };
  }

  if (file.size > OCR_MAX_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      success: false, suggestedClaim: "", claimScore: 0, text: "",
      error: `File too large (${mb} MB). Maximum is 1 MB for OCR.`,
    };
  }

  const ext = mime === "image/png" ? "PNG" : mime === "image/webp" ? "WEBP" : "JPG";

  // ── 2. Preprocess: detect platform + crop regions ─────────────────────────
  const T_PRE_START = performance.now();
  const preprocess = await preprocessScreenshot(file);
  const T_PRE_END   = performance.now();
  const preprocessMs = T_PRE_END - T_PRE_START;

  const useRegions =
    preprocess.platform !== "unknown" && preprocess.regions.length > 0;

  // ── 3. OCR ────────────────────────────────────────────────────────────────
  const T_OCR_START = performance.now();
  const rawTexts: string[] = [];
  let ocrError: string | undefined;

  if (useRegions) {
    // Send each cropped region to OCR.Space sequentially.
    // Sequential (not parallel) because OCR.Space free tier throttles
    // concurrent requests from the same API key.
    for (const region of preprocess.regions as CroppedRegion[]) {
      const result = await callOCRSpace(region.blob, region.label, "JPG");
      if (result.error) {
        console.warn(`[OCR] Region "${region.label}" failed: ${result.error}`);
        // Non-fatal — continue with other regions
      } else if (result.text) {
        rawTexts.push(result.text);
      }
    }

    if (rawTexts.length === 0) {
      // All regions failed — fall back to full image
      console.warn("[OCR] All regions failed. Falling back to full-image OCR.");
      const fallback = await callOCRSpace(file, "full-image-fallback", ext);
      if (fallback.text) rawTexts.push(fallback.text);
      else ocrError = fallback.error;
    }
  } else {
    // No preprocessing — send the original file
    const result = await callOCRSpace(file, "full-image", ext);
    if (result.text) rawTexts.push(result.text);
    else ocrError = result.error;
  }

  const T_OCR_END = performance.now();
  const ocrMs = T_OCR_END - T_OCR_START;

  // ── 4. Early exit on total OCR failure ───────────────────────────────────
  if (rawTexts.length === 0) {
    return {
      success: false, suggestedClaim: "", claimScore: 0, text: "",
      error: ocrError ?? "Walang teksto ang nahanap sa larawan. Subukan ang mas malinaw na screenshot.",
    };
  }

  // ── 5. Merge + clean + extract ────────────────────────────────────────────
  const T_POST_START = performance.now();

  const merged  = mergeRegionTexts(rawTexts);
  const cleaned = cleanOCRText(merged);
  const { claim: suggestedClaim, score: claimScore } = extractClaim(cleaned);

  const T_POST_END = performance.now();
  const postMs = T_POST_END - T_POST_START;

  // ── 6. Timing report ──────────────────────────────────────────────────────
  const totalMs = performance.now() - T_START;
  const regionCount = useRegions ? preprocess.regions.length : 1;
  const totalBlobKB = useRegions
    ? (preprocess.regions as CroppedRegion[])
        .reduce((sum, r) => sum + r.blob.size, 0) / 1024
    : file.size / 1024;

  console.info(
    `[OCR] ── Pipeline report ────────────────────────────────────\n` +
    `  Input file:          ${(file.size / 1024).toFixed(1)} KB  (${file.type})\n` +
    `  Platform detected:   ${preprocess.platform}\n` +
    `  Regions:             ${regionCount} ` +
      (useRegions
        ? `(${(preprocess.regions as CroppedRegion[]).map((r) => r.label).join(", ")})\n`
        : "(full image)\n") +
    `  Total blob sent:     ${totalBlobKB.toFixed(1)} KB` +
      (useRegions ? `  [${((1 - totalBlobKB / (file.size / 1024)) * 100).toFixed(0)}% smaller than full image]` : "") + `\n` +
    `  ──────────────────────────────────────────────────────────\n` +
    `  Preprocess (crop):   ${preprocessMs.toFixed(0)}ms\n` +
    `  OCR.Space (all):     ${ocrMs.toFixed(0)}ms  (${regionCount} call${regionCount > 1 ? "s" : ""})\n` +
    `  Merge + clean:       ${postMs.toFixed(0)}ms\n` +
    `  Total wall-clock:    ${totalMs.toFixed(0)}ms\n` +
    `  ──────────────────────────────────────────────────────────\n` +
    `  Claim score:         ${claimScore}\n` +
    `  Suggested claim:     "${suggestedClaim.slice(0, 80)}${suggestedClaim.length > 80 ? "…" : ""}"\n` +
    `────────────────────────────────────────────────────────────`,
  );

  return {
    success: true,
    suggestedClaim,
    claimScore,
    text: cleaned,
  };
}
