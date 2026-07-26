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
 */

// ── Verdict ──────────────────────────────────────────────────────────────────

/** The four possible fact-check outcomes. */
export type Verdict = "true" | "false" | "misleading" | "unverified";

// ── Source ───────────────────────────────────────────────────────────────────
export interface Source {
  title: string;
  url: string;
  sourceName: string;
  publishedDate: string;
  summary: string;
}

// ── Verify request ────────────────────────────────────────────────────────────
export interface VerifyRequest {
  claim: string;
  category?: string;
}

// ── Raw search result (Tavily) ────────────────────────────────────────────────
export interface SearchResult {
  title: string;
  url: string;
  content: string;      // excerpt / snippet
  score: number;        // Tavily relevance score 0–1
  publishedDate: string;
  rawContent?: string;  // full page text when requested
}

// ── Search response wrapper ───────────────────────────────────────────────────
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchedAt: string; // ISO 8601
}

// ── Verify result ─────────────────────────────────────────────────────────────
export interface VerifyResult {
  claim: string;
  verdict: Verdict;
  confidence: number; // 0–100
  explanation: string; // 2–4 sentences (Filipino/Taglish)
  truthStatement: string; // 1–2 sentences on what is actually true
  supportingEvidence: Source[];
  contradictingEvidence: Source[];
  reliableSources: Source[];
  mascotAdvice: string;
  searchResultsCount: number;
  verifiedAt: string; // ISO 8601
}

// ── API error ─────────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
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
  /** Raw OCR text found in the image, if any. */
  ocrText: string;
  /** Detected language of the text. */
  language: string;
  /** Whether the extraction was successful. */
  success: boolean;
  /** Error message if extraction failed. */
  error?: string;
}

/** Error returned by analyze-image when image is rejected before AI call. */
export interface ImageAnalysisError {
  error: string;
  code: "UNSUPPORTED_FORMAT" | "FILE_TOO_LARGE" | "NO_IMAGE" | "AI_FAILED";
}
