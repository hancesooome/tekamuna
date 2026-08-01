/**
 * ImageAnalyser — AI Vision pipeline for Image-to-Claim extraction
 *
 * Responsibilities:
 *   1. Validate image (format, size)
 *   2. Try OpenRouter vision models first, Gemini as fallback
 *   3. Extract OCR text and identify the primary factual claim
 *   4. Return structured ImageAnalysisResult
 *
 * The AI's job is ONLY to identify what claim the image makes.
 * It must NOT fact-check, assess truth, or assign credibility.
 *
 * ── How to add a new vision provider ─────────────────────────────────────────
 * 1. Implement VisionProvider in /worker/ai/providers/<Name>VisionProvider.ts
 * 2. Instantiate it in createProviders() below
 * 3. Add it to the priority list
 */

import type { ImageAnalysisResult } from "../../src/types/verify";
import type { VisionProvider }      from "../ai/providers/VisionProvider";
import { OpenRouterVisionProvider } from "../ai/providers/OpenRouterVisionProvider";
import { GeminiVisionProvider }     from "../ai/providers/GeminiVisionProvider";

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

// ── Prompt ────────────────────────────────────────────────────────────────────

const USER_PROMPT =
  `Analyze this image and extract the factual claim it contains.\n\n` +
  `Steps:\n` +
  `1. Read all visible text (OCR).\n` +
  `2. Identify the primary factual claim being made.\n` +
  `3. Express it as a single concise declarative sentence.\n` +
  `4. If no text is visible, describe only what the image appears to claim visually.\n\n` +
  `Rules:\n` +
  `- Do NOT determine if the claim is true or false.\n` +
  `- Do NOT add information not visible in the image.\n` +
  `- Keep claim under 200 characters.\n` +
  `- Use Filipino/English depending on the image language.\n\n` +
  `Output this exact JSON:\n` +
  `{\n` +
  `  "claim": "The concise factual claim extracted from the image",\n` +
  `  "confidence": 0-100,\n` +
  `  "ocrText": "All visible text found in the image, or empty string if none",\n` +
  `  "language": "Filipino|English|Mixed|Unknown"\n` +
  `}`;

// ── JSON extractor ────────────────────────────────────────────────────────────

interface VisionJsonResult {
  claim:      string;
  confidence: number;
  ocrText:    string;
  language:   string;
}

function extractVisionJson(raw: string): VisionJsonResult {
  let s = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const objStart = s.indexOf("{");
  if (objStart === -1) throw new Error("No JSON object in vision response");
  s = s.slice(objStart);

  // Brace-depth tracking for correct nested object extraction
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)       { esc = false; continue; }
    if (c === "\\") { esc = true;  continue; }
    if (c === '"')  { inStr = !inStr; continue; }
    if (inStr)      continue;
    if (c === "{")  { depth++; continue; }
    if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }

  const jsonStr = end !== -1
    ? s.slice(0, end + 1)
    : s.slice(0, s.lastIndexOf("}") + 1);

  if (!jsonStr) throw new Error("Could not extract JSON from vision response");

  const parsed = JSON.parse(jsonStr) as Partial<VisionJsonResult>;

  return {
    claim:      String(parsed.claim      ?? "").trim().slice(0, 500),
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence ?? 50)))),
    ocrText:    String(parsed.ocrText    ?? "").trim().slice(0, 2000),
    language:   String(parsed.language   ?? "Unknown"),
  };
}

// ── Provider factory ──────────────────────────────────────────────────────────

function createProviders(
  openRouterKey?:  string,
  openRouterKey2?: string,
  geminiKey?:      string,
): VisionProvider[] {
  const providers: VisionProvider[] = [];

  // OpenRouter key 1 — try first
  if (openRouterKey?.trim()) {
    providers.push(new OpenRouterVisionProvider(openRouterKey.trim()));
  }

  // OpenRouter key 2 — tried if key 1 is exhausted
  if (openRouterKey2?.trim() && openRouterKey2.trim() !== openRouterKey?.trim()) {
    providers.push(new OpenRouterVisionProvider(openRouterKey2.trim()));
  }

  // Gemini — final fallback
  if (geminiKey?.trim().startsWith("AIza")) {
    providers.push(new GeminiVisionProvider(geminiKey.trim()));
  }

  return providers;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationError {
  error: string;
  code: "UNSUPPORTED_FORMAT" | "FILE_TOO_LARGE" | "NO_IMAGE";
}

export function validateImageFile(
  file: File | null | undefined,
): ValidationError | null {
  if (!file) {
    return { error: "No image provided.", code: "NO_IMAGE" };
  }

  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return {
      error: `Unsupported format "${file.type}". Please upload JPG, PNG, or WebP.`,
      code:  "UNSUPPORTED_FORMAT",
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      error: `File too large (${mb} MB). Maximum allowed is 10 MB.`,
      code:  "FILE_TOO_LARGE",
    };
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface AnalyseImageInput {
  imageData:        Uint8Array;
  mimeType:         "image/jpeg" | "image/png" | "image/webp";
  openRouterKey?:   string;
  openRouterKey2?:  string;  // second key, tried when first is exhausted
  geminiKey?:       string;
}

export async function analyseImage(
  input: AnalyseImageInput,
): Promise<ImageAnalysisResult> {
  const providers = createProviders(input.openRouterKey, input.openRouterKey2, input.geminiKey);

  if (providers.length === 0) {
    return {
      success:    false,
      claim:      "",
      confidence: 0,
      ocrText:    "",
      language:   "Unknown",
      error:      "No AI vision provider configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY.",
    };
  }

  // Convert bytes to base64
  const base64 = btoa(String.fromCharCode(...input.imageData));

  let lastError = "Vision analysis failed.";

  for (const provider of providers) {
    try {
      const visionResponse = await provider.analyse({
        imageBase64: base64,
        mimeType:    input.mimeType,
        prompt:      USER_PROMPT,
        maxTokens:   500,
      });

      const extracted = extractVisionJson(visionResponse.content);

      if (!extracted.claim) {
        lastError = "AI could not identify a claim in the image.";
        continue;
      }

      return {
        success:    true,
        claim:      extracted.claim,
        confidence: extracted.confidence,
        ocrText:    extracted.ocrText,
        language:   extracted.language,
      };

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[ImageAnalyser] Provider ${provider.id} failed: ${lastError}`);
      continue;
    }
  }

  // All providers failed
  return {
    success:    false,
    claim:      "",
    confidence: 0,
    ocrText:    "",
    language:   "Unknown",
    error:      `Unable to analyze the image. Please enter the claim manually. (${lastError.slice(0, 100)})`,
  };
}
