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
 */

/** Encode a claim string to a URL-safe Base64url string. */
export function encodeClaim(claim: string): string {
  // TextEncoder → Uint8Array → base64 string → base64url (replace + / and strip =)
  const bytes = new TextEncoder().encode(claim);
  const binStr = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binStr)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a Base64url string back to a claim string. Returns null if invalid. */
export function decodeClaim(encoded: string): string | null {
  try {
    // Restore standard base64 (add padding back, replace - _)
    const base64 = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");

    const binStr = atob(base64);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);

    // Basic sanity — must be a non-empty string within the claim length limit
    if (!decoded || decoded.trim().length === 0 || decoded.length > 1000) return null;
    return decoded.trim();
  } catch {
    return null;
  }
}

/** Build the full shareable URL for a given claim. */
export function buildShareUrl(claim: string): string {
  const encoded = encodeClaim(claim);
  const base = window.location.origin;
  return `${base}/check?c=${encoded}`;
}
