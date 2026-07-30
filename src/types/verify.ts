/**
 * src/types/verify.ts
 *
 * Purpose:
 *   Shared TypeScript types for the Teka Muna verification pipeline.
 *   Used by both the frontend (src/) and the Cloudflare Worker (worker/).
 *
 * Responsibilities:
 *   - Domain types: Verdict, Source, VerifyResult, SearchResult
 *   - API contract types: VerifyRequest, ImageAnalysisResult, ApiError
 *   - Type guards: isApiError()
 *
 * Rules:
 *   - This file must contain ONLY types, interfaces, and type guards.
 *   - No display labels, no constants, no business logic.
 *   - Display labels (VERDICT_LABELS) live in src/constants/index.ts.
 *
 * Dependencies: none
 *
 * What is a "type" vs "interface"?
 *   - `type`      → alias for a type expression; used here for union types (Verdict)
 *   - `interface` → describes the shape of an object; preferred for data structures
 *   Both are TypeScript-only — they disappear completely at runtime (no JS output).
 */

// ── Verdict ──────────────────────────────────────────────────────────────────

/**
 * The four possible fact-check outcomes.
 * A union type: a variable of type Verdict can ONLY be one of these four strings.
 * TypeScript will give a compile error if you accidentally write "True" or "FALSE".
 */
export type Verdict = "true" | "false" | "misleading" | "unverified";
//                     ↑            ↑              ↑                ↑
//            Claim is true   Claim is false   Partially true   Not enough evidence

// ── Source ───────────────────────────────────────────────────────────────────
// Represents a single web source retrieved by Tavily and/or classified by the AI.
export interface Source {
  title:         string; // Headline of the article/page
  url:           string; // Full URL (used as unique ID for deduplication)
  sourceName:    string; // Display name (e.g. "Philippine Daily Inquirer")
  publishedDate: string; // ISO 8601 date string (e.g. "2026-07-26T00:00:00.000Z")
  summary:       string; // 1–3 sentence excerpt / AI-generated summary
}

// ── Verify request ────────────────────────────────────────────────────────────
// The payload the frontend sends to POST /api/verify.
export interface VerifyRequest {
  claim:     string;   // The factual claim to check (5–1000 chars)
  category?: string;   // Optional category hint (e.g. "Pulitika", "Kalusugan")
  // ? means optional — TypeScript allows omitting this field entirely
}

// ── Raw search result (Tavily) ────────────────────────────────────────────────
// A single result from Tavily's web search API, before credibility scoring.
export interface SearchResult {
  title:         string;
  url:           string;
  content:       string;       // excerpt / snippet (Tavily's trimmed version)
  score:         number;       // Tavily relevance score 0–1 (higher = more relevant)
  publishedDate: string;
  rawContent?:   string;       // full page text, only present when requested
  // ? means this field may or may not be present — always check before using
}

// ── Search response wrapper ───────────────────────────────────────────────────
// The full response from the Tavily search endpoint (wraps the results array).
export interface SearchResponse {
  query:        string;
  results:      SearchResult[];
  totalResults: number;
  searchedAt:   string; // ISO 8601 — when the search was performed
}

// ── Verify result ─────────────────────────────────────────────────────────────
// The complete response from POST /api/verify.
// This is what gets saved to sessionStorage and displayed on ResultPage.
export interface VerifyResult {
  claim:                 string;    // The original claim text (echoed back)
  verdict:               Verdict;   // "true" | "false" | "misleading" | "unverified"
  confidence:            number;    // 0–100 — how sure the AI is (capped based on source count)
  explanation:           string;    // 2–4 sentences (Filipino/Taglish) explaining the verdict
  truthStatement:        string;    // 1–2 sentences on what is actually true/confirmed
  supportingEvidence:    Source[];  // Sources that back up the claim
  contradictingEvidence: Source[];  // Sources that refute the claim
  reliableSources:       Source[];  // All credible sources retrieved (for display)
  mascotAdvice:          string;    // Teka mascot tip (e.g. "Huwag munang i-share!")
  searchResultsCount:    number;    // How many Tavily results were retrieved
  verifiedAt:            string;    // ISO 8601 timestamp of when verification ran
  // ── Cache status metadata ──────────────────────────────────────────────────
  cached?:               boolean;   // True if this result was loaded from cache
  cacheStatus?:          "fresh" | "expired" | null; // Cache status: fresh, expired or null (miss)
  expiresAt?:            string;    // ISO 8601 timestamp when cache record expires
  pipelineVersion?:      number;    // Version of the fact check pipeline used
  category?:             string;    // Classified category for caching and routing
}

// ── API error ─────────────────────────────────────────────────────────────────
// The shape of a generic error response from the Worker.
// Example: { "error": "Field `claim` is required." }
export interface ApiError {
  error: string;
}

/**
 * Type guard for ApiError.
 *
 * A "type guard" is a function that returns a boolean AND narrows the TypeScript
 * type inside an if-block. After calling isApiError(x) and it returns true,
 * TypeScript knows x is ApiError — so x.error is safe to access.
 *
 * Why `value is ApiError` instead of `boolean`?
 *   That's the type predicate syntax. It tells TypeScript: "if this returns true,
 *   treat the parameter as ApiError from this point on."
 *
 * @example
 *   const data = await response.json();
 *   if (isApiError(data)) {
 *     console.log(data.error); // TypeScript knows this is safe
 *   }
 */
export function isApiError(value: unknown): value is ApiError {
  return (
    // Must be a non-null object (arrays are objects too, so check !== null)
    typeof value === "object" &&
    value !== null &&
    // Must have an "error" key
    "error" in value &&
    // The "error" value must be a string (not a number or object)
    typeof (value as Record<string, unknown>).error === "string"
  );
}

// ── Image analysis ────────────────────────────────────────────────────────────

/** Response from POST /api/analyze-image */
export interface ImageAnalysisResult {
  /** The extracted factual claim from the image. */
  claim: string;
  /** AI confidence in the extraction (0–100). */
  confidence: number;
  /** Raw OCR text found in the image, if any. OCR = Optical Character Recognition */
  ocrText: string;
  /** Detected language of the text (e.g. "Filipino", "English"). */
  language: string;
  /** Whether the extraction was successful. Always check this before using `claim`. */
  success: boolean;
  /** Error message if extraction failed. Only present when success=false. */
  error?: string;
}

/** Error returned by analyze-image when image is rejected BEFORE the AI call. */
export interface ImageAnalysisError {
  error: string;
  // Specific error code for the frontend to handle different failure cases:
  //   UNSUPPORTED_FORMAT → not a jpg/png/webp
  //   FILE_TOO_LARGE     → exceeds size limit
  //   NO_IMAGE           → no file was uploaded
  //   AI_FAILED          → AI model call failed
  code: "UNSUPPORTED_FORMAT" | "FILE_TOO_LARGE" | "NO_IMAGE" | "AI_FAILED";
}
