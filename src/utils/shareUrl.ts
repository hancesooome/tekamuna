/**
 * src/utils/shareUrl.ts
 *
 * Stateless share URL helpers.
 *
 * Encoding:  claim (UTF-8 string) → Base64url (URL-safe, no padding issues)
 * Decoding:  Base64url → UTF-8 claim string
 *
 * Format: /check?c=<base64url-encoded-claim>
 *
 * Why Base64url instead of encodeURIComponent?
 *   - Filipino text and Unicode encode cleanly without % sequences
 *   - URLs stay shorter and more shareable
 *   - Base64url uses A-Z a-z 0-9 - _ only (no + / or = padding issues in URLs)
 *
 * Encoding pipeline:
 *   claim string
 *     → TextEncoder (convert to UTF-8 bytes, handles Filipino chars like ñ, é)
 *     → Uint8Array  (raw bytes)
 *     → btoa()      (bytes → standard base64 string: A-Z, a-z, 0-9, +, /, =)
 *     → replace +→- /→_ strip= (standard base64 → URL-safe base64url)
 *
 * Decoding pipeline (reverse):
 *   base64url string
 *     → replace -→+ _→/ add= (base64url → standard base64)
 *     → atob()      (standard base64 → binary string)
 *     → Uint8Array  (binary string → bytes)
 *     → TextDecoder (bytes → UTF-8 string)
 */

/** Encode a claim string to a URL-safe Base64url string. */
export function encodeClaim(claim: string): string {
  // Step 1: TextEncoder converts the claim string to a Uint8Array of UTF-8 bytes.
  //   This correctly handles multi-byte characters (e.g. Filipino ñ, Chinese chars).
  const bytes = new TextEncoder().encode(claim);

  // Step 2: Convert the Uint8Array to a plain binary string.
  //   btoa() only accepts binary strings (each char = one byte), not Uint8Array.
  //   Array.from() creates a regular array from the typed array,
  //   then .map() converts each byte number to its character equivalent.
  const binStr = Array.from(bytes, (b) => String.fromCharCode(b)).join("");

  // Step 3: btoa() encodes the binary string to standard base64.
  // Step 4: Make it URL-safe (base64url):
  //   + → -   (+ is reserved in URLs as a space character)
  //   / → _   (/ is the URL path separator)
  //   = → ""  (= padding at the end causes issues in some URL parsers)
  return btoa(binStr)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a Base64url string back to a claim string. Returns null if invalid. */
export function decodeClaim(encoded: string): string | null {
  try {
    // Step 1: Reverse the URL-safe substitutions to get standard base64.
    //   - → +   _ → /
    // Step 2: Re-add = padding.
    //   Base64 strings must have a length that's a multiple of 4.
    //   (4 - length % 4) % 4 calculates how many = chars to add.
    //   padEnd(newLength, "=") pads the string to the target length.
    const base64 = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");

    // Step 3: atob() decodes standard base64 → binary string (one char per byte)
    const binStr = atob(base64);

    // Step 4: Convert the binary string back to a Uint8Array of bytes.
    //   Uint8Array.from() creates a typed array.
    //   The mapping function converts each character to its char code (byte value).
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));

    // Step 5: TextDecoder converts the UTF-8 byte array back to a normal string.
    const decoded = new TextDecoder().decode(bytes);

    // Sanity check: must be a non-empty string within a reasonable length.
    // We reject empty strings, strings that are just whitespace, and absurdly long values.
    if (!decoded || decoded.trim().length === 0 || decoded.length > 1000) return null;
    return decoded.trim();
  } catch {
    // atob() throws if the input isn't valid base64.
    // We return null to signal "invalid / tampered URL parameter".
    return null;
  }
}

/** Build the full shareable URL for a given claim. */
export function buildShareUrl(claim: string): string {
  const encoded = encodeClaim(claim);
  // window.location.origin → e.g. "https://tekamuna.ph" (scheme + domain + port)
  const base = window.location.origin;
  // CheckPage reads the `c` query parameter and auto-fills the claim input.
  return `${base}/check?c=${encoded}`;
}
