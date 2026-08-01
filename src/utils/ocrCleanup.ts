/**
 * ocrCleanup.ts
 *
 * A provider-agnostic OCR text cleanup utility.
 * Works with any OCR source: Google Vision, Tesseract, OCR.Space, etc.
 *
 * Usage:
 *   const rawOCR = await performOCR(image);
 *   const cleaned = cleanOCRText(rawOCR);
 *   const claim = extractClaim(cleaned);
 *
 * Rules:
 *   - Pure function, no side effects
 *   - No spell correction
 *   - No word guessing
 *   - No capitalization changes
 *   - Preserves URLs, emails, dates, numbers, currency, percentages
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options to selectively enable/disable pipeline steps for future flexibility. */
export interface OCRCleanupOptions {
  /** Normalize Unicode to NFC/NFKC. Default: true */
  normalizeUnicode?: boolean;
  /** Remove zero-width and invisible characters. Default: true */
  removeInvisibleChars?: boolean;
  /** Replace non-breaking spaces with regular spaces. Default: true */
  replaceNonBreakingSpaces?: boolean;
  /** Normalize CR/CRLF line endings to LF. Default: true */
  normalizeLineEndings?: boolean;
  /** Collapse multiple spaces into one. Default: true */
  collapseSpaces?: boolean;
  /** Remove excessive blank lines (more than one consecutive). Default: true */
  removeExcessiveBlankLines?: boolean;
  /** Trim leading/trailing whitespace from the whole text. Default: true */
  trim?: boolean;
  /** Normalize curly quotes, dashes, ellipsis. Default: true */
  normalizePunctuation?: boolean;
  /** Remove replacement characters (U+FFFD) and common OCR artifacts. Default: true */
  removeOCRArtifacts?: boolean;
}

const DEFAULT_OPTIONS: Required<OCRCleanupOptions> = {
  normalizeUnicode: true,
  removeInvisibleChars: true,
  replaceNonBreakingSpaces: true,
  normalizeLineEndings: true,
  collapseSpaces: true,
  removeExcessiveBlankLines: true,
  trim: true,
  normalizePunctuation: true,
  removeOCRArtifacts: true,
};

// ---------------------------------------------------------------------------
// Individual cleanup steps (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Step 1 – Normalize Unicode.
 * NFKC decomposes compatibility characters (e.g. ﬁ → fi, ² → 2) and then
 * re-composes canonical sequences. This catches many OCR ligature issues
 * without altering meaning.
 */
export function normalizeUnicode(text: string): string {
  return text.normalize("NFKC");
}

/**
 * Step 2 – Remove zero-width and invisible Unicode characters.
 * These are injected by some OCR engines or copy-paste operations and are
 * invisible to the eye but break string matching.
 *
 * Removed characters:
 *   U+200B  ZERO WIDTH SPACE
 *   U+200C  ZERO WIDTH NON-JOINER
 *   U+200D  ZERO WIDTH JOINER
 *   U+200E  LEFT-TO-RIGHT MARK
 *   U+200F  RIGHT-TO-LEFT MARK
 *   U+FEFF  ZERO WIDTH NO-BREAK SPACE (BOM)
 *   U+2060  WORD JOINER
 *   U+2061–U+2064  Invisible math operators
 */
export function removeInvisibleChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u200B-\u200F\uFEFF\u2060-\u2064]/g, "");
}

/**
 * Step 3 – Replace non-breaking spaces (U+00A0) with regular spaces.
 * OCR engines often encode inter-word gaps as NBSP, which breaks tokenization.
 */
export function replaceNonBreakingSpaces(text: string): string {
  return text.replace(/\u00A0/g, " ");
}

/**
 * Step 4 – Normalize line endings.
 * Convert Windows-style CRLF and bare CR to Unix LF so subsequent
 * line-based operations behave consistently.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Step 5 – Collapse multiple spaces into a single space.
 * Operates within lines only (newlines are preserved).
 * Tabs are also converted to a single space here.
 */
export function collapseSpaces(text: string): string {
  // Replace tabs with a single space first
  const deTabbed = text.replace(/\t/g, " ");
  // Collapse runs of spaces (not newlines) to one space per line
  return deTabbed.replace(/[ ]{2,}/g, " ");
}

/**
 * Step 6 – Remove excessive blank lines.
 * More than one consecutive blank line is collapsed to a single blank line.
 * This preserves paragraph breaks without allowing OCR-generated whitespace
 * floods to bloat the output.
 */
export function removeExcessiveBlankLines(text: string): string {
  // Three or more consecutive newlines → two newlines (one blank line)
  return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * Step 7 – Trim leading and trailing whitespace from the entire text.
 */
export function trimText(text: string): string {
  return text.trim();
}

/**
 * Step 8 – Normalize punctuation.
 *
 * Replacements made:
 *   Curly/smart double quotes  → "
 *   Curly/smart single quotes  → '
 *   Em dash (—), en dash (–)   → -
 *   Horizontal bar (―)         → -
 *   Unicode ellipsis (…)       → ...
 *   Prime/double-prime (′ ″)   → ' "   (common OCR misread)
 *
 * Capitalization and word content are NOT touched.
 */
export function normalizePunctuation(text: string): string {
  return (
    text
      // Curly double quotes → straight double quote
      .replace(/[\u201C\u201D\u201E\u201F\u275D\u275E]/g, '"')
      // Curly single quotes / apostrophes → straight apostrophe
      .replace(/[\u2018\u2019\u201A\u201B\u275B\u275C]/g, "'")
      // Prime and double-prime (often misread as quote marks)
      .replace(/\u2032/g, "'")
      .replace(/\u2033/g, '"')
      // Em dash, en dash, horizontal bar → hyphen-minus
      .replace(/[\u2014\u2013\u2015]/g, "-")
      // Unicode ellipsis character → three dots
      .replace(/\u2026/g, "...")
  );
}

/**
 * Step 9 – Remove OCR artifacts.
 *
 * Removed:
 *   U+FFFD  Unicode replacement character (�) – appears when OCR can't decode a glyph
 *   Runs of 3+ repeated non-alphanumeric characters that form noise lines
 *   (e.g. "|||||||", "######", "~~~~~") – common scan artifacts
 *
 * Preserved:
 *   URLs, emails, dates, numbers, currency (e.g. $1,234.56), percentages (12%)
 *   Legitimate repeated punctuation like "..." is already normalized above.
 */
export function removeOCRArtifacts(text: string): string {
  // Remove the Unicode replacement character
  let cleaned = text.replace(/\uFFFD/g, "");

  // Remove lines that consist entirely of repeated non-alphanumeric "noise" chars
  // (3 or more of the same non-word character, optionally with spaces).
  // This targets artifact rows like "| | | | |" or "# # # # #" without
  // touching legitimate content.
  cleaned = cleaned
    .split("\n")
    .map((line) => {
      // A noise line: only non-alphanumeric chars (same char repeated) + spaces
      const stripped = line.replace(/\s/g, "");
      if (stripped.length >= 3) {
        const uniqueChars = new Set(stripped).size;
        // If only 1 unique non-space character and it's not alphanumeric → artifact
        if (uniqueChars === 1 && /\W/.test(stripped[0])) {
          return "";
        }
      }
      return line;
    })
    .join("\n");

  return cleaned;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * cleanOCRText
 *
 * Runs raw OCR output through an ordered cleanup pipeline and returns a
 * clean string ready for downstream processing (claim extraction, NLP, etc.).
 *
 * The function is a pure transform: same input always produces same output,
 * no network calls, no mutations, no side effects.
 *
 * @param text    Raw string from any OCR provider.
 * @param options Optional flags to skip individual pipeline steps.
 * @returns       Cleaned text string.
 *
 * @example
 *   const rawOCR = await performOCR(image);
 *   const cleaned = cleanOCRText(rawOCR);
 *   const claim = extractClaim(cleaned);
 */
export function cleanOCRText(
  text: string,
  options: OCRCleanupOptions = {}
): string {
  const opts: Required<OCRCleanupOptions> = { ...DEFAULT_OPTIONS, ...options };

  let result = text;

  // Step 1 – Unicode normalization (NFKC)
  if (opts.normalizeUnicode) {
    result = normalizeUnicode(result);
  }

  // Step 2 – Strip zero-width / invisible characters
  if (opts.removeInvisibleChars) {
    result = removeInvisibleChars(result);
  }

  // Step 3 – Non-breaking spaces → regular spaces
  if (opts.replaceNonBreakingSpaces) {
    result = replaceNonBreakingSpaces(result);
  }

  // Step 4 – Normalize line endings (CRLF / CR → LF)
  if (opts.normalizeLineEndings) {
    result = normalizeLineEndings(result);
  }

  // Step 5 – Collapse multiple spaces / tabs on each line
  if (opts.collapseSpaces) {
    result = collapseSpaces(result);
  }

  // Step 6 – Collapse excessive blank lines
  if (opts.removeExcessiveBlankLines) {
    result = removeExcessiveBlankLines(result);
  }

  // Step 7 – Trim whole-text whitespace
  if (opts.trim) {
    result = trimText(result);
  }

  // Step 8 – Normalize smart quotes, dashes, ellipsis
  if (opts.normalizePunctuation) {
    result = normalizePunctuation(result);
  }

  // Step 9 – Remove replacement chars and noise artifact lines
  if (opts.removeOCRArtifacts) {
    result = removeOCRArtifacts(result);
  }

  // Final trim in case artifact removal left trailing whitespace
  return result.trim();
}

export default cleanOCRText;
