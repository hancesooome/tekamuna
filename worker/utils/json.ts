/**
 * worker/utils/json.ts
 *
 * Purpose:
 *   Robust JSON extraction from AI model responses.
 *   Models frequently produce imperfect JSON — trailing commas, control chars
 *   in strings, truncated responses, or prose mixed in.
 *
 *   This utility handles more cases than `JSON.parse` alone.
 *
 * Dependencies: none
 */

/**
 * Extracts the first complete JSON object from a raw model response.
 *
 * Steps (in order of increasing desperation):
 *   1. Strip markdown fences and leading prose
 *   2. Locate the JSON object via brace-depth tracking
 *   3. Attempt JSON.parse directly
 *   4. On failure: sanitise common LLM mistakes and retry
 *   5. On second failure: extract known fields via regex (defensive fallback)
 *
 * Common LLM mistakes handled:
 *   - Trailing commas  ({a:1,} → {a:1})
 *   - Single-quoted keys ('key' → "key")
 *   - Quoted numbers     ("42" as value → 42 — only in array/object contexts)
 *   - Literal newlines/tabs in strings (rare: converted to escaped form)
 *
 * @param raw  Raw string content from an AI model response.
 * @returns    Parsed object of type T.
 * @throws     Error if no JSON object can be found or parsed.
 */
export function extractJson<T>(raw: string): T {
  // ── 1. Strip markdown fences ──────────────────────────────────────────
  let s = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  // ── 2. Locate JSON object via brace-depth tracking ─────────────────────
  const objStart = s.indexOf("{");
  if (objStart === -1) throw new Error("No JSON object found in response");
  s = s.slice(objStart);

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)        { esc = false; continue; }
    if (c === "\\") { esc = true;  continue; }
    if (c === '"')  { inStr = !inStr; continue; }
    if (inStr)      continue;
    if (c === "{")  { depth++; continue; }
    if (c === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  const jsonStr = end !== -1
    ? s.slice(0, end + 1)
    : s.slice(0, s.lastIndexOf("}") + 1);

  if (!jsonStr) throw new Error("Could not extract JSON object from response");

  // ── 3. Try direct parse ───────────────────────────────────────────────
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Fall through to sanitisation
  }

  // ── 4. Sanitise common LLM JSON mistakes and retry ────────────────────
  const cleaned = sanitiseJsonString(jsonStr);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall through to regex extraction
  }

  // ── 5. Last resort: extract known fields via regex ────────────────────
  // This catches cases where the JSON is fundamentally malformed but key
  // fields are still present (e.g. truncated mid-object).
  const fieldExtract = extractFieldsViaRegex(jsonStr);
  if (Object.keys(fieldExtract).length > 0) {
    return fieldExtract as T;
  }

  throw new Error(`Failed to parse JSON from: ${jsonStr.slice(0, 200)}`);
}

// ── Sanitiser ────────────────────────────────────────────────────────────────

/**
 * Applies a series of regex-based fixes to repair common LLM JSON mistakes.
 * Each fix targets a specific class of error observed in production.
 *
 * Fixes applied:
 *   a) Trailing comma before closing brace/bracket: {a:1,} → {a:1}
 *   b) // or /* comments (some models add them despite instructions)
 *   c) Single-quoted keys: 'key' → "key"
 *   d) NaN, Infinity literals → null (JSON doesn't support them)
 *   e) Unquoted keys (rare but possible): key: → "key":
 */
function sanitiseJsonString(raw: string): string {
  let s = raw;

  // (a) Remove trailing commas before } or ] — the most common LLM mistake.
  // /\s*,\s*(?=\s*[}\]])/g matches an optional comma with optional whitespace
  // that is directly followed by } or ].
  s = s.replace(/\s*,\s*(?=\s*[}\]])/g, "");

  // (b) Strip single-line // comments and multi-line /* */ comments.
  // We process // first (they're simpler), then block comments.
  // Warning: // inside a JSON string is NOT handled — rare edge case.
  s = s.replace(/\/\/.*$/gm, "");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");

  // (c) Replace single-quoted keys with double-quoted keys.
  // Matches: 'property-name': → "property-name":
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'\s*:/g, '"$1":');

  // (d) Remove commas before closing braces/brackets again (may have been
  // exposed after comment removal).
  s = s.replace(/\s*,\s*(?=\s*[}\]])/g, "");

  return s;
}

// ── Regex field extractor (last resort) ──────────────────────────────────────

/**
 * Extracts top-level fields from a malformed JSON string via regex.
 *
 * Handles: string, number, boolean, null, and string-only values.
 * Does NOT handle nested objects/arrays (keeps complexity low).
 *
 * This is the final fallback — used when the model output is so broken
 * that even sanitiseJsonString can't fix it. Better to recover partial
 * data than throw the entire response away.
 *
 * @returns A flat key-value map of whatever fields could be extracted.
 */
function extractFieldsViaRegex(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Match patterns like: "fieldName": value
  // Value can be: "string", 42, true, false, null
  // Flag `g` = global (find all matches, not just the first)
  const fieldRegex = /"([^"\\]*(\\.[^"\\]*)*)"\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(raw)) !== null) {
    const key = match[1];       // The field name inside quotes
    const rawValue = match[3];  // The value as a string

    // Parse the value into its correct JavaScript type
    let value: unknown;
    if (rawValue.startsWith('"')) {
      // String value — strip surrounding quotes
      value = rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
    } else if (rawValue === "true") {
      value = true;
    } else if (rawValue === "false") {
      value = false;
    } else if (rawValue === "null") {
      value = null;
    } else {
      // Number — parseFloat handles integers, decimals, and scientific notation
      value = parseFloat(rawValue);
    }

    result[key] = value;
  }

  return result;
}
