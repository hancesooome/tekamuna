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
 * Dependencies:
 *   - src/types/verify.ts (VerifyResult, Source)
 *
 * When to modify:
 *   - Changing how sources are deduplicated or sorted
 *   - Changing the date display format
 *   - Adding new source-related utilities
 */

import type { VerifyResult, Source } from "@/types";
import { getCredibility } from "@/lib/credibility";

// ── Source stance ─────────────────────────────────────────────────────────────

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
  if (result.supportingEvidence.some((s) => s.url === source.url))    return "Supports";
  if (result.contradictingEvidence.some((s) => s.url === source.url)) return "Contradicts";
  return "Neutral";
}

// ── Source merging ────────────────────────────────────────────────────────────

/**
 * Merges reliableSources, supportingEvidence, and contradictingEvidence
 * into a single deduplicated array sorted by credibility score (descending).
 *
 * Deduplication is by URL — first occurrence wins.
 *
 * @param result  The VerifyResult containing the source arrays.
 * @returns       Deduplicated, credibility-sorted array of Source objects.
 */
export function allSourcesMerged(result: VerifyResult): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of [
    ...result.reliableSources,
    ...result.supportingEvidence,
    ...result.contradictingEvidence,
  ]) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
  }
  return out.sort(
    (a, b) => getCredibility(b.url).score - getCredibility(a.url).score,
  );
}

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Formats an ISO 8601 date string for display in Filipino locale.
 * Returns "—" for empty, invalid, or missing dates.
 *
 * @param iso  ISO 8601 date string (e.g. "2026-07-26T10:00:00.000Z").
 * @returns    Formatted string like "Jul 26, 2026", or "—".
 *
 * @example
 *   formatDate("2026-07-26T10:00:00.000Z") // "Jul 26, 2026"
 *   formatDate("")                          // "—"
 */
export function formatDate(iso: string): string {
  if (!iso || iso.trim() === "") return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
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
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 160)
    .slice(0, 4);
}
