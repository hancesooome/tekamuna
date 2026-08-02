/**
 * src/utils/share.ts
 *
 * Share helpers — native share on mobile, platform links + clipboard on desktop.
 */

import { VERDICT_LABELS, API_BASE_URL } from "@/constants";
import { ensureShareCardUploaded } from "@/services/shareCardService";
import { buildShareUrl, encodeClaim } from "@/utils/shareUrl";
import type { VerifyResult } from "@/types";

export interface SharePayload {
  url: string;
  title: string;
  text: string;
  label: string;
}

export interface ShareOutcome {
  copied: boolean;
  cancelled: boolean;
}

export type SharePlatform = "facebook" | "messenger" | "x" | "whatsapp" | "telegram";

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function buildSharePayload(result: VerifyResult): SharePayload {
  const url = buildShareUrl(result.claim);
  const label = VERDICT_LABELS[result.verdict];
  return {
    url,
    title: result.claim,
    text: `${label}: ${result.claim}`,
    label,
  };
}

/**
 * Build the URL that Facebook (and other crawlers) should fetch for OG tags.
 * Points to /api/og/preview which returns full OG HTML + a meta-refresh
 * redirect back to the real /check page for human visitors.
 */
function buildOgPreviewUrl(claim: string): string {
  const encoded = encodeClaim(claim);
  const origin = window.location.origin;
  // Use absolute API base if configured (prod Worker), else same-origin /api
  const base = API_BASE_URL.startsWith("http") ? API_BASE_URL : origin + "/api";
  return `${base}/og/preview?c=${encodeURIComponent(encoded)}&origin=${encodeURIComponent(origin)}`;
}

/** Kick off OG image upload without blocking UI. */
export function prepareShare(result: VerifyResult): void {
  ensureShareCardUploaded(result).catch((err) => {
    console.warn("[share] OG upload failed:", err);
  });
}

function canUseNativeShare(payload: SharePayload): boolean {
  if (!navigator.share || !isMobileDevice()) return false;

  if (navigator.canShare) {
    try {
      return navigator.canShare({
        url: payload.url,
        title: payload.title,
        text: payload.text,
      });
    } catch {
      return false;
    }
  }

  return true;
}

export function getPlatformShareUrl(platform: SharePlatform, payload: SharePayload, claim?: string): string {
  const { url, text } = payload;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  // Facebook's crawler will fetch ogUrl to read OG meta tags.
  // Real users get redirected back to /check via meta-refresh in the og/preview response.
  const ogUrl = claim ? buildOgPreviewUrl(claim) : url;
  const encodedOgUrl = encodeURIComponent(ogUrl);

  switch (platform) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedOgUrl}`;
    case "messenger":
      // fb-messenger:// deep link works without a Facebook App ID.
      // On desktop (no app installed) it falls back to the Messenger web share page.
      return isMobileDevice()
        ? `fb-messenger://share?link=${encodedOgUrl}`
        : `https://www.facebook.com/dialog/send?link=${encodedOgUrl}&redirect_uri=${encodedUrl}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
  }
}

export function openPlatformShare(platform: SharePlatform, payload: SharePayload): void {
  const shareUrl = getPlatformShareUrl(platform, payload, payload.title);
  window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=640");
}

export async function copyShareLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** Mobile: native share sheet. Desktop: returns { showDialog: true }. */
export async function shareFactCheck(result: VerifyResult): Promise<ShareOutcome & { showDialog?: boolean }> {
  const payload = buildSharePayload(result);
  prepareShare(result);

  if (canUseNativeShare(payload)) {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return { copied: false, cancelled: false };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { copied: false, cancelled: true };
      }
    }
  }

  return { copied: false, cancelled: false, showDialog: true };
}
