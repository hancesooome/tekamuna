/**
 * shared/shareUrl.ts
 *
 * Stateless share URL helpers — shared between frontend, Worker, and edge middleware.
 */

/** Encode a claim string to a URL-safe Base64url string. */
export function encodeClaim(claim: string): string {
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
    const base64 = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");

    const binStr = atob(base64);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);

    if (!decoded || decoded.trim().length === 0 || decoded.length > 1000) return null;
    return decoded.trim();
  } catch {
    return null;
  }
}

/** Build a shareable /check URL for a claim (origin must be supplied server-side). */
export function buildSharePath(claim: string): string {
  return `/check?c=${encodeClaim(claim)}`;
}
