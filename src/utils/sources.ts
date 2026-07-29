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
  // .some() returns true if at least one element in the array matches the condition.
  // We check if the source's URL appears in the supportingEvidence array.
  // Using URL as the unique ID because titles can vary (e.g. shortened vs full).
  if (result.supportingEvidence.some((s) => s.url === source.url))    return "Supports";
  if (result.contradictingEvidence.some((s) => s.url === source.url)) return "Contradicts";
  // If it's in neither array, it's a reliable source that the AI cited but
  // didn't specifically classify as supporting or contradicting.
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
  // Set is a data structure that stores unique values.
  // We use it to track which URLs we've already added (to deduplicate).
  const seen = new Set<string>();
  const out: Source[] = [];

  // Spread all three arrays into one big array and loop through them.
  // The order matters: reliableSources first → their URL "wins" the dedup check.
  for (const s of [
    ...result.reliableSources,
    ...result.supportingEvidence,
    ...result.contradictingEvidence,
  ]) {
    // If we haven't seen this URL yet, add it to the result.
    if (!seen.has(s.url)) {
      seen.add(s.url);  // mark as seen
      out.push(s);      // add to output array
    }
    // If seen.has(s.url) is true, skip this source (it's a duplicate).
  }

  // Sort by credibility score, descending (highest score first).
  // .sort() uses a comparator function: negative = a before b, positive = b before a.
  // getCredibility(b.url).score - getCredibility(a.url).score → descending order.
  return out.sort(
    (a, b) => getCredibility(b.url).score - getCredibility(a.url).score,
  );
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
