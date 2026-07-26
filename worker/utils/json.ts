/**
 * worker/utils/json.ts
 *
 * Purpose:
 *   Robust JSON extraction from AI model responses.
 *   Models frequently wrap JSON in markdown fences or add prose before/after.
 *   This utility handles all those cases reliably.
 *
 * Dependencies: none
 */

/**
 * Extracts the first complete, valid JSON object from a raw model response.
 *
 * Handles:
 *   - Markdown fences (```json ... ```)
 *   - Leading/trailing prose ("Here is the JSON: {...}")
 *   - Nested objects (uses brace-depth tracking, not lastIndexOf)
 *   - Truncated responses (falls back to last closing brace)
 *
 * @param raw  Raw string content from an AI model response.
 * @returns    Parsed object of type T.
 * @throws     Error if no JSON object can be found or parsed.
 */
export function extractJson<T>(raw: string): T {
  // Strip markdown fences
  let s = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im,     "")
    .replace(/\s*```\s*$/im,  "")
    .trim();

  // Find the first opening brace — everything before is prose
  const objStart = s.indexOf("{");
  if (objStart === -1) throw new Error("No JSON object found in response");
  s = s.slice(objStart);

  // Walk forward with brace-depth tracking to find the matching closing brace.
  // This correctly handles nested objects unlike lastIndexOf("}").
  let depth = 0;
  let inStr  = false;
  let esc    = false;
  let end    = -1;

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

  // Fallback: use last "}" if brace tracking didn't close cleanly
  const jsonStr = end !== -1
    ? s.slice(0, end + 1)
    : s.slice(0, s.lastIndexOf("}") + 1);

  if (!jsonStr) throw new Error("Could not extract JSON object from response");

  return JSON.parse(jsonStr) as T;
}
