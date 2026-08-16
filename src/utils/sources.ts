/**
 * src/utils/sources.ts
 *
 * Purpose:
 *   Pure utility functions for working with VerifyResult source arrays.
 *   Shared between ResultPage and SourceComparisonPage to eliminate duplication.
 *
 * Responsibilities:
 *   - Merge and deduplicate sources from a VerifyResult
 *   - Determine the stance of a source (supports / contradicts / neutral)
 *   - Format ISO date strings for display
 *   - Extract key facts from a source summary
 *
 * "Pure" means:
 *   - These functions have NO side effects (no API calls, no state changes)
 *   - Same input always produces the same output
 *   - Easy to unit test
 *
 * Dependencies:
 *   - src/types/verify.ts (VerifyResult, Source)
 *
 * When to modify:
 *   - Changing how sources are deduplicated or sorted
 *   - Changing the date display format
 *   - Adding new source-related utilities
 */

import type { VerifyResult, Source } from "@/types";
// VerifyResult → the full result object (contains supportingEvidence, contradictingEvidence, etc.)
// Source       → a single source: { title, url, sourceName, publishedDate, summary }

import { getCredibility } from "@/lib/credibility";
// getCredibility(url) → returns { score: number, category: string }
// Score 0–100: higher = more credible (e.g. gov.ph = 95, unknown blog = 30)

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    const params = new URLSearchParams(parsed.searchParams);
    const normalizedParams = new URLSearchParams();
    const ignoredParam = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|_gl|_ga|_hs_enc)$/i;

    Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => {
        if (!ignoredParam.test(key)) {
          normalizedParams.append(key, value);
        }
      });

    const query = normalizedParams.toString();
    return `https://${hostname}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return url.trim();
  }
}

function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];

  for (const source of sources) {
    const key = normalizeUrl(source.url);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(source);
    }
  }

  return out;
}

// ── Source stance ─────────────────────────────────────────────────────────────

// A union type: SourceStance can only be one of these three string values.
// TypeScript enforces this everywhere it's used — no typos possible.
export type SourceStance = "Supports" | "Contradicts" | "Neutral";

/**
 * Determines whether a source supports, contradicts, or is neutral
 * relative to the AI verdict for a given VerifyResult.
 *
 * @param source  The source to classify.
 * @param result  The VerifyResult that contains the evidence arrays.
 * @returns       "Supports", "Contradicts", or "Neutral".
 */
export function stanceOf(source: Source, result: VerifyResult): SourceStance {
  const normalizedSourceUrl = normalizeUrl(source.url);

  // AI-explicitly classified sources take priority. Compare normalized URLs
  // so small tracking / query string differences don't split the same article.
  if (result.supportingEvidence.some((s) => normalizeUrl(s.url) === normalizedSourceUrl)) {
    return "Supports";
  }
  if (result.contradictingEvidence.some((s) => normalizeUrl(s.url) === normalizedSourceUrl)) {
    return "Contradicts";
  }

  // Source was in reliableSources but the AI didn't explicitly classify it.
  // Infer stance from the overall verdict — a source present in the results
  // for a "true" verdict is likely supporting; for "false", likely contradicting.
  if (result.verdict === "true") return "Supports";
  if (result.verdict === "false") return "Contradicts";

  // For "misleading" or "unverified": the source's relationship is genuinely
  // ambiguous, so "Neutral" is correct.
  return "Neutral";
}

// ── Source merging ────────────────────────────────────────────────────────────

/**
 * Merges reliableSources, supportingEvidence, and contradictingEvidence
 * into a single deduplicated array sorted by credibility score (descending).
 *
 * Deduplication is by URL — first occurrence wins.
 * Sort order: most credible source first (gov.ph > established news > blogs).
 *
 * @param result  The VerifyResult containing the source arrays.
 * @returns       Deduplicated, credibility-sorted array of Source objects.
 */
export function allSourcesMerged(result: VerifyResult): Source[] {
  // Deduplicate all sources by normalized URL, preserving order priority.
  const merged = uniqueSources([
    ...result.reliableSources,
    ...result.supportingEvidence,
    ...result.contradictingEvidence,
  ]);

  // Sort by credibility score, descending (highest score first).
  return merged.sort(
    (a, b) => getCredibility(b.url).score - getCredibility(a.url).score,
  );
}

export function uniqueEvidenceSources(result: VerifyResult): Source[] {
  return uniqueSources([...result.supportingEvidence, ...result.contradictingEvidence]);
}

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Formats an ISO 8601 date string for display in Filipino locale.
 * Returns "Hindi available" for empty, invalid, or missing dates.
 *
 * @param iso  ISO 8601 date string (e.g. "2026-07-26T10:00:00.000Z").
 * @returns    Formatted string like "Jul 26, 2026", or "Hindi available".
 *
 * @example
 *   formatDate("2026-07-26T10:00:00.000Z") // "Jul 26, 2026"
 *   formatDate("")                          // "Hindi available"
 */
export function formatDate(iso: string): string {
  // Guard: empty or whitespace-only string → not available
  if (!iso || iso.trim() === "") return "Hindi available";

  // new Date(iso) parses an ISO 8601 string into a JavaScript Date object.
  const d = new Date(iso);

  // isNaN(d.getTime()) is the standard way to check if a Date is invalid.
  // An invalid date (e.g. "not-a-date") returns NaN from .getTime().
  if (isNaN(d.getTime())) return "Hindi available";

  // toLocaleDateString formats the date for display.
  // "en-PH" → English as used in the Philippines (same as "en" but region-aware).
  // Options: { month: "short", day: "numeric", year: "numeric" } → "Jul 26, 2026"
  return d.toLocaleDateString("en-PH", {
    month: "short",   // "Jul" (abbreviated month name)
    day:   "numeric", // "26"  (no leading zero)
    year:  "numeric", // "2026"
  });
}

// ── Key fact extraction ───────────────────────────────────────────────────────

/**
 * Extracts up to 4 short, verifiable key facts from a source summary string.
 * Splits on sentence boundaries and filters to sentences of useful length.
 *
 * @param summary  The raw summary text from a Source object.
 * @returns        Array of 0–4 fact strings.
 */
export function extractKeyFacts(summary: string): string[] {
  return summary
    // 1. Collapse multiple newlines into a single space (clean up multi-line summaries)
    .replace(/\n+/g, " ")

    // 2. Split on sentence boundaries.
    //    (?<=[.!?]) is a "lookbehind assertion" — it matches a position AFTER .!?
    //    \s+ matches the whitespace between sentences.
    //    Result: ["Sentence one.", "Sentence two.", "Sentence three."]
    .split(/(?<=[.!?])\s+/)

    // 3. Trim leading/trailing whitespace from each sentence fragment.
    .map((s) => s.trim())

    // 4. Filter to sentences that are a "useful" length:
    //    > 20 chars  → exclude very short fragments (e.g. "Yes." or "True.")
    //    < 160 chars → exclude very long run-on sentences that aren't scannable
    .filter((s) => s.length > 20 && s.length < 160)

    // 5. Take only the first 4 facts to keep the UI concise.
    .slice(0, 4);
}

/**
 * Infers a display category from a claim string by matching keywords.
 * Falls back to "Pangkalahatan" if no keyword matches.
 */
import { CATEGORY_KEYWORD_MAP } from "@/constants";

export function inferCategory(claim: string): string {
  for (const [key, cat] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (claim.includes(key)) return cat;
  }
  return "Pangkalahatan";
}
