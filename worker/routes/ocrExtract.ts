/**
 * POST /api/ocr-extract
 *
 * Accepts raw OCR text, runs cleanOCRText() + extractClaim(), and returns
 * the cleaned text plus the best deterministic claim candidate.
 *
 * WHY NO OCR HERE?
 * The OCR.Space call was moved to the browser (src/services/ocrService.ts)
 * to avoid a Cloudflare Worker → Cloudflare-proxied-origin routing error
 * that caused every outbound fetch to api.ocr.space to fail with an
 * "internal error" reference code.
 *
 * This endpoint now serves as a server-side text-processing utility:
 *   - Mobile / native clients that do their own OCR can POST raw text here
 *   - Future server-side pipelines (e.g. email fact-check bot)
 *   - Integration tests for the claim extractor
 *
 * Request:  POST  application/json  { text: string }
 * Response: OCRExtractResult
 *
 * Success (200):
 *   { success: true, text: "cleaned...", suggestedClaim: "...", claimScore: 12 }
 *
 * Failure (422):
 *   { success: false, error: "...", code: "MISSING_TEXT" | "TEXT_TOO_LONG" }
 */

import type { Env }     from "../index";
import { cleanOCRText } from "../../src/utils/ocrCleanup";
import { extractClaim } from "../../src/utils/claimExtractor";

// ── Config ────────────────────────────────────────────────────────────────────

/** Guard against absurdly large payloads. */
const MAX_TEXT_LENGTH = 50_000; // characters

// ── Response type ─────────────────────────────────────────────────────────────

export interface OCRExtractResult {
  success: boolean;
  /** Full cleaned OCR text. Empty string on failure. */
  text: string;
  /**
   * Best candidate claim extracted deterministically.
   * Empty string when no good candidate was found.
   */
  suggestedClaim: string;
  /** Confidence score for suggestedClaim. */
  claimScore: number;
  /** Human-readable error. Only present on failure. */
  error?: string;
  /** Machine-readable failure code. Only present on failure. */
  code?: "MISSING_TEXT" | "TEXT_TOO_LONG" | "INVALID_BODY";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function handleOCRExtract(
  request: Request,
  _env: Env,
): Promise<Response> {

  // ── 1. Parse JSON body ────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false, text: "", suggestedClaim: "", claimScore: 0,
        error: "Request body must be valid JSON with a `text` field.",
        code:  "INVALID_BODY",
      } satisfies OCRExtractResult,
      400,
    );
  }

  const raw = (body as Record<string, unknown>)?.text;

  // ── 2. Validate ───────────────────────────────────────────────────────────
  if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
    return json(
      {
        success: false, text: "", suggestedClaim: "", claimScore: 0,
        error: "Field `text` is required and must be a non-empty string.",
        code:  "MISSING_TEXT",
      } satisfies OCRExtractResult,
      422,
    );
  }

  if (raw.length > MAX_TEXT_LENGTH) {
    return json(
      {
        success: false, text: "", suggestedClaim: "", claimScore: 0,
        error:   `Field \`text\` must not exceed ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
        code:    "TEXT_TOO_LONG",
      } satisfies OCRExtractResult,
      422,
    );
  }

  // ── 3. Clean ──────────────────────────────────────────────────────────────
  const cleaned = cleanOCRText(raw);

  // ── 4. Extract claim ──────────────────────────────────────────────────────
  const { claim: suggestedClaim, score: claimScore } = extractClaim(cleaned);

  console.info(
    `[OCRExtract] text-only mode — input: ${raw.length} chars, ` +
    `cleaned: ${cleaned.length} chars, ` +
    `claim: "${suggestedClaim.slice(0, 60)}${suggestedClaim.length > 60 ? "…" : ""}" ` +
    `(score ${claimScore})`,
  );

  // ── 5. Return ─────────────────────────────────────────────────────────────
  return json(
    {
      success: true,
      text:    cleaned,
      suggestedClaim,
      claimScore,
    } satisfies OCRExtractResult,
    200,
  );
}
