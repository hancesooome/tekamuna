/**
 * worker/services/ocrSpace.ts
 *
 * OCR.Space API client for Cloudflare Workers.
 * Docs: https://ocr.space/ocrapi
 *
 * Sends the image as a base64 data URI inside an
 * application/x-www-form-urlencoded body.
 *
 * WHY NOT multipart/form-data?
 * Cloudflare Workers has a known internal serialization error when you attach
 * a Blob to a FormData object and pass it to an outbound fetch(). The worker
 * runtime throws "internal error" before the request even leaves the edge.
 *
 * WHY NOT new URLSearchParams({ base64Image: dataUri })?
 * URLSearchParams percent-encodes every value, which turns the '+', '/', '='
 * characters in a base64 string into %2B, %2F, %3D — inflating a 1 MB image
 * to ~1.7 MB and causing OCR.Space to spend extra time decoding.
 *
 * SOLUTION: build the form body string manually.
 * We percent-encode only the fields that need it (language, filetype) and
 * append the base64 data URI raw. This is valid
 * application/x-www-form-urlencoded per RFC 1866 §8.2 — only characters
 * outside the "unreserved" set technically need encoding, and OCR.Space
 * accepts the raw base64 alphabet characters without encoding.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OCRSpaceOptions {
  /** Raw image bytes. */
  imageBytes: Uint8Array;
  /** MIME type of the image. */
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** OCR.Space API key. */
  apiKey: string;
  /**
   * OCR engine:
   *   1 = Tesseract (fastest, best for clean printed text — default)
   *   2 = OCR.Space engine 2 (better for complex layouts / mixed text)
   */
  ocrEngine?: 1 | 2;
  /** Language hint. Defaults to "eng". Filipino text works well under "eng". */
  language?: string;
}

interface OCRSpaceParsedResult {
  FileParseExitCode: number;
  ParsedText: string;
  ErrorMessage?: string;
}

interface OCRSpaceResponse {
  ParsedResults?: OCRSpaceParsedResult[];
  OCRExitCode: number;            // 1=success 2=partial 3=failed 4=timeout
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string | string[];
  ProcessingTimeInMilliseconds?: string;
}

export interface OCRSpaceResult {
  text: string;
  exitCode: number;
  isErrored: boolean;
  error?: string;
  processingTimeMs?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OCR_SPACE_API_URL = "https://api.ocr.space/parse/image";

const MIME_TO_EXT: Record<OCRSpaceOptions["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert Uint8Array → base64 string.
 * Processes in 8 KB chunks to avoid stack overflow on large images.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Build an application/x-www-form-urlencoded body string WITHOUT
 * percent-encoding the base64Image field.
 *
 * Standard URLSearchParams would encode '+' → '%2B', '/' → '%2F',
 * '=' → '%3D' in the base64 string, inflating the payload by ~30%.
 * OCR.Space accepts the raw base64 alphabet characters just fine.
 *
 * All other (small, safe) fields are encoded normally via encodeURIComponent.
 */
function buildFormBody(fields: Record<string, string>, rawFields: Record<string, string>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }

  // Raw fields: key is encoded, value is NOT
  for (const [key, value] of Object.entries(rawFields)) {
    parts.push(`${encodeURIComponent(key)}=${value}`);
  }

  return parts.join("&");
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runOCRSpace(options: OCRSpaceOptions): Promise<OCRSpaceResult> {
  const {
    imageBytes,
    mimeType,
    apiKey,
    ocrEngine = 1,
    language  = "eng",
  } = options;

  const ext     = MIME_TO_EXT[mimeType];
  const base64  = uint8ToBase64(imageBytes);
  const dataUri = `data:image/${ext};base64,${base64}`;

  // Safe (small) fields go through normal percent-encoding.
  // The base64Image data URI goes in rawFields to skip double-encoding.
  const body = buildFormBody(
    {
      language:          language,
      OCREngine:         String(ocrEngine),
      isOverlayRequired: "false",
      detectOrientation: "true",
      scale:             "true",
      filetype:          ext.toUpperCase(),
    },
    {
      base64Image: dataUri,
    },
  );

  let raw: Response;
  try {
    raw = await fetch(OCR_SPACE_API_URL, {
      method:  "POST",
      headers: {
        "apikey":       apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (err) {
    return {
      text:      "",
      exitCode:  3,
      isErrored: true,
      error:     `Network error calling OCR.Space: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let data: OCRSpaceResponse;
  try {
    data = await raw.json() as OCRSpaceResponse;
  } catch {
    return {
      text:      "",
      exitCode:  3,
      isErrored: true,
      error:     `OCR.Space returned non-JSON (HTTP ${raw.status})`,
    };
  }

  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(" ")
      : (data.ErrorMessage ?? "Unknown OCR.Space error");
    return { text: "", exitCode: data.OCRExitCode ?? 3, isErrored: true, error: msg };
  }

  const pages = data.ParsedResults ?? [];

  const combinedText = pages
    .map((p) => p.ParsedText ?? "")
    .join("\n")
    .trim();

  const pageError = pages
    .filter((p) => p.FileParseExitCode !== 1)
    .map((p) => p.ErrorMessage ?? "")
    .filter(Boolean)
    .join("; ");

  const processingTimeMs = data.ProcessingTimeInMilliseconds
    ? parseInt(data.ProcessingTimeInMilliseconds, 10)
    : undefined;

  return {
    text:      combinedText,
    exitCode:  data.OCRExitCode,
    isErrored: false,
    error:     pageError || undefined,
    processingTimeMs,
  };
}
