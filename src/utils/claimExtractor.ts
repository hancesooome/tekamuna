/**
 * claimExtractor.ts
 *
 * Deterministic OCR claim extractor — no AI, no network calls.
 *
 * Usage:
 *   const rawOCR = await performOCR(image);
 *   const cleaned = cleanOCRText(rawOCR);
 *   const claim = extractClaim(cleaned);
 *
 * Pipeline:
 *   1. Split into lines
 *   2. Strip Facebook / social-media UI chrome
 *   3. Remove page names, timestamps, engagement counts, dates
 *   4. Deduplicate
 *   5. Drop garbage lines (too short, all-symbol, OCR noise)
 *   6. Merge wrapped headline fragments into complete sentences
 *   7. Score every remaining line
 *   8. Merge consecutive high-scoring lines that share a headline
 *   9. Return the best candidate
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. UI-chrome patterns to remove entirely
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exact or near-exact strings that are Facebook / Instagram / TikTok UI labels.
 * Matched case-insensitively after trimming.
 */
const UI_EXACT = new Set([
  "like", "comment", "share", "follow", "following", "unfollow",
  "subscribe", "subscribed",
  "see more", "see less", "show more", "show less",
  "read more", "read less",
  "sponsored", "suggested for you", "suggested post",
  "promoted", "paid partnership",
  "most relevant", "all comments", "view all comments",
  "reply", "replies",
  "hide", "hide comment",
  "turn on notifications",
  "ai content", "ai-generated", "made with ai", "ai overview",
  "fact check", "fact-check", "independent fact-checkers",
  "more", "less",
  "public", "friends", "only me",
  "save", "saved",
  "report", "report post",
  "copy link", "embed",
  "view original", "view source",
  "close", "cancel", "done",
  "reactions", "top reactions",
  "love", "haha", "wow", "sad", "angry",  // reaction labels
]);

/**
 * Regex patterns that identify UI chrome or metadata lines.
 * Each pattern is tested against the trimmed line (case-insensitive).
 */
const UI_PATTERNS: RegExp[] = [
  // Engagement counts:  "1.2K likes"  "34 comments"  "5 shares"
  /^\d[\d.,KkMm]* +(like|comment|share|reaction|view|repost|retweet)s?$/i,

  // Relative timestamps:  "3 mins ago"  "1 hr"  "Just now"  "Yesterday"
  /^(\d+ *(min|minute|hr|hour|day|week|month|year)s? *(ago)?|just now|yesterday|today)$/i,

  // Absolute dates:  "January 5, 2024"  "Jan 5"  "05/01/2024"  "2024-01-05"
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w* *\d{1,2},? *\d{0,4}$/i,
  /^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/,
  /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/,

  // Clock times:  "3:45 PM"  "14:00"
  /^\d{1,2}:\d{2}( *[ap]m)?$/i,

  // Follower / subscriber counts:  "12.5K followers"  "1M subscribers"
  /^\d[\d.,KkMmBb]* +(follower|subscriber|member|fan)s?$/i,

  // "X and Y others reacted"
  /^.{0,60} and \d+ others? (reacted|liked|commented)$/i,

  // Pure number-only lines (page counts, IDs)
  /^\d+$/,

  // URL-only lines
  /^https?:\/\/\S+$/i,

  // Lines that are just hashtags or mentions
  /^(#\w+\s*)+$/,
  /^(@\w+\s*)+$/,

  // "Shared a post" / "shared a photo"
  /^shared a (post|photo|video|reel|story|link)$/i,

  // "X people like this" / "X people follow this"
  /^\d[\d.,KkMm]* +people (like|follow|watched|viewed) this$/i,

  // Post privacy labels with icon remnants: "· Public" "· Friends"
  /^[·•\-\s]*(public|friends|only me|custom)$/i,

  // "Write a comment…"
  /^write a (comment|reply)\.{0,3}$/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. Page / account name heuristics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lines that look like page / account names to skip.
 * Heuristic: ≤ 6 words, no sentence-ending punctuation, not all-caps.
 * This is intentionally conservative — only very short name-like strings.
 */
function looksLikePageName(line: string): boolean {
  const words = line.trim().split(/\s+/);
  if (words.length > 6) return false;                      // too long to be a name
  if (/[.!?]$/.test(line)) return false;                   // ends with sentence punct → real sentence
  if (/\d/.test(line)) return false;                       // contains digits → probably not a name
  if (/[₱$€£¥%]/.test(line)) return false;                // currency → probably a claim
  // All-caps short line AND no common words → likely a banner/header noise
  if (words.length <= 3 && line === line.toUpperCase() && /^[A-Z\s]+$/.test(line)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Garbage / noise detection
// ─────────────────────────────────────────────────────────────────────────────

const MIN_LINE_LENGTH = 12;   // chars — shorter lines are almost always UI noise
const MIN_WORD_COUNT  = 3;    // words

function isGarbage(line: string): boolean {
  const trimmed = line.trim();

  if (trimmed.length < MIN_LINE_LENGTH) return true;

  const words = trimmed.split(/\s+/);
  if (words.length < MIN_WORD_COUNT) return true;

  // Mostly non-alphabetic (symbol noise from OCR misreads)
  const alphaCount = (trimmed.match(/[a-zA-Z\u00C0-\u024F]/g) ?? []).length;
  if (alphaCount / trimmed.length < 0.4) return true;

  // Repeating character runs (OCR line-noise: "------", "======", "......")
  if (/(.)\1{4,}/.test(trimmed)) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Headline-fragment detection (for merging wrapped lines)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A line is a headline fragment when it:
 *   - Does NOT end with sentence-final punctuation (.  !  ?)
 *   - Is relatively short (≤ 120 chars)
 *   - Does not look like a complete self-contained sentence
 *
 * We use this to merge adjacent fragments like:
 *   "Marcos signs law raising"
 *   "minimum wage to ₱750"
 * → "Marcos signs law raising minimum wage to ₱750"
 */
function isHeadlineFragment(line: string): boolean {
  const t = line.trim();
  if (t.length > 120) return false;
  if (/[.!?]["'»]?$/.test(t)) return false;   // ends with sentence punct
  if (/[;:,]$/.test(t)) return false;          // ends with clause punct — might continue but not a fragment
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a candidate line. Higher = more likely to be the factual claim.
 *
 * Factors:
 *   + Length bonus (longer = more informative, up to a cap)
 *   + Ends with sentence-final punctuation
 *   + Contains a number (quantities, percentages, years)
 *   + Contains currency symbols
 *   + Contains a percentage
 *   + Contains a proper-noun-like capitalized word (not first-word)
 *   + Contains a verb-like word (reported, said, signed, etc.)
 *   − Very short lines
 *   − Lines that start with lowercase (likely mid-sentence continuation)
 *   − Lines with an abnormally high punctuation/char ratio (OCR noise)
 */
function scoreLine(line: string): number {
  const t = line.trim();
  let score = 0;

  // Length bonus — sweet spot is 40–200 chars
  const len = t.length;
  if (len >= 40)  score += 3;
  if (len >= 80)  score += 2;
  if (len >= 120) score += 1;
  if (len > 300)  score -= 2;  // very long lines are often paragraph dumps

  // Sentence-final punctuation
  if (/[.!?]["'»]?$/.test(t)) score += 4;

  // Contains a number (year, quantity, percent value)
  if (/\d/.test(t)) score += 3;

  // Contains currency symbol
  if (/[₱$€£¥]/.test(t)) score += 4;

  // Contains a percentage
  if (/%/.test(t)) score += 3;

  // Contains a proper-noun mid-sentence (capital letter not at word start)
  const words = t.split(/\s+/);
  const midCapitals = words.slice(1).filter((w) => /^[A-Z\u00C0-\u024F]/.test(w)).length;
  score += Math.min(midCapitals, 4);  // cap at 4 so proper names don't dominate

  // Verb indicators — claims usually have an action
  if (/\b(said|says|signed|issued|announced|declared|reported|confirmed|revealed|warned|urges?|calls?|orders?|bans?|suspends?|arrests?|files?|wins?|loses?|rises?|falls?|increases?|decreases?|reaches?)\b/i.test(t)) {
    score += 3;
  }

  // Penalty: starts with lowercase (fragment / continuation)
  if (/^[a-z]/.test(t)) score -= 3;

  // Penalty: high punctuation density (OCR noise)
  const punctCount = (t.match(/[^a-zA-Z0-9\s\u00C0-\u024F]/g) ?? []).length;
  if (punctCount / t.length > 0.25) score -= 4;

  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractClaimResult {
  /** The best candidate claim line, or empty string if nothing was found. */
  claim: string;
  /** Confidence score (arbitrary units — higher is better). */
  score: number;
  /** All candidate lines after filtering, with their scores, for debugging. */
  candidates: { line: string; score: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * extractClaim
 *
 * Extracts the most likely factual claim from cleaned OCR text.
 * Deterministic — identical input always produces identical output.
 * No network calls, no AI, no external dependencies.
 *
 * @param cleanedText  Output of cleanOCRText() (or any normalised string).
 * @returns            ExtractClaimResult
 *
 * @example
 *   const raw     = await performOCR(image);
 *   const cleaned = cleanOCRText(raw);
 *   const { claim } = extractClaim(cleaned);
 *   if (claim) submitForVerification(claim);
 */
export function extractClaim(cleanedText: string): ExtractClaimResult {
  // ── Step 1: Split into lines ────────────────────────────────────────────
  const rawLines = cleanedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // ── Step 2 & 3: Filter UI chrome, page names, metadata ─────────────────
  const filtered = rawLines.filter((line) => {
    const lower = line.toLowerCase().trim();

    // Exact UI label match
    if (UI_EXACT.has(lower)) return false;

    // Regex UI pattern match
    if (UI_PATTERNS.some((re) => re.test(line))) return false;

    // Page/account name heuristic
    if (looksLikePageName(line)) return false;

    return true;
  });

  // ── Step 4: Deduplicate (case-insensitive, preserve first occurrence) ───
  const seen = new Set<string>();
  const deduped = filtered.filter((line) => {
    const key = line.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Step 5: Drop garbage lines ──────────────────────────────────────────
  const clean = deduped.filter((line) => !isGarbage(line));

  // ── Step 6: Merge wrapped headline fragments ────────────────────────────
  // Walk the array; when a line is a fragment and the next line continues it,
  // join them together (with a space).
  const merged: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let current = clean[i];

    // Keep joining forward while:
    //   - current doesn't end with sentence punctuation
    //   - next line exists and doesn't look like a standalone new sentence
    while (
      isHeadlineFragment(current) &&
      i + 1 < clean.length &&
      // Next line must be short too (both fragments of the same headline)
      clean[i + 1].length <= 120 &&
      // Next line shouldn't start a completely new sentence (capital after period)
      !/^\p{Lu}/u.test(clean[i + 1]) === false  // allow capitals (headlines start with caps)
        ? clean[i + 1].length <= 80              // but only merge if next line is short
        : false
    ) {
      i++;
      current = `${current} ${clean[i]}`;
    }

    // Simpler secondary pass: join two adjacent short fragments when the first
    // has no ending punctuation and both together are ≤ 200 chars.
    if (
      isHeadlineFragment(current) &&
      i + 1 < clean.length &&
      current.length + clean[i + 1].length + 1 <= 200 &&
      !isGarbage(clean[i + 1])
    ) {
      i++;
      current = `${current} ${clean[i]}`;
    }

    merged.push(current);
    i++;
  }

  // ── Step 7: Score all remaining lines ───────────────────────────────────
  const candidates = merged
    .map((line) => ({ line, score: scoreLine(line) }))
    .filter(({ score }) => score > 0)   // drop lines with zero or negative score
    .sort((a, b) => b.score - a.score); // highest score first

  if (candidates.length === 0) {
    return { claim: "", score: 0, candidates: [] };
  }

  // ── Step 8: Merge consecutive high-scoring lines (same headline) ─────────
  // If the top-2 candidates are adjacent in the merged array AND both are
  // headline fragments, combine them into a single claim.
  let bestClaim  = candidates[0].line;
  let bestScore  = candidates[0].score;

  if (candidates.length >= 2) {
    const top    = candidates[0];
    const second = candidates[1];

    const topIdx    = merged.indexOf(top.line);
    const secondIdx = merged.indexOf(second.line);

    const areAdjacent  = Math.abs(topIdx - secondIdx) === 1;
    const combinedLen  = top.line.length + second.line.length + 1;
    const bothFragments = isHeadlineFragment(top.line) || isHeadlineFragment(second.line);

    if (areAdjacent && bothFragments && combinedLen <= 250 && second.score >= top.score * 0.6) {
      // Put them in document order
      const [first, next] = topIdx < secondIdx
        ? [top.line, second.line]
        : [second.line, top.line];
      bestClaim = `${first} ${next}`;
      bestScore = top.score + second.score;
    }
  }

  // ── Step 9: Trim and return ──────────────────────────────────────────────
  bestClaim = bestClaim.trim().replace(/\s{2,}/g, " ");

  return {
    claim:      bestClaim,
    score:      bestScore,
    candidates,
  };
}
