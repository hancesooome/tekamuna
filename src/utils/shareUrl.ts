/**
 * src/utils/shareUrl.ts
 *
 * Stateless share URL helpers (client-side).
 * Core encode/decode lives in shared/shareUrl.ts.
 */

import { encodeClaim, decodeClaim } from "../../shared/shareUrl";

export { encodeClaim, decodeClaim };

/** Build the full shareable URL for a given claim. */
export function buildShareUrl(claim: string): string {
  const encoded = encodeClaim(claim);
  const base = window.location.origin;
  return `${base}/check?c=${encoded}`;
}

/** Absolute URL for the OG preview image of a claim. */
export function buildOgImageUrl(claim: string): string {
  const encoded = encodeClaim(claim);
  const base = window.location.origin;
  return `${base}/api/og/image?c=${encodeURIComponent(encoded)}`;
}
