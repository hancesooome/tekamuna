import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility used by every shadcn/ui component.
 * Merges Tailwind classes safely, resolving conflicts via tailwind-merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * downloadPng
 *
 * Download a PNG data URL as a file on both desktop and mobile.
 *
 * Desktop / Android:
 *   Converts the data URL to a Blob object URL and triggers a download.
 *   Object URLs carry the correct MIME type — no .txt extension issue.
 *
 * iOS Safari:
 *   The `download` attribute is ignored entirely on iOS. Instead we open
 *   the image in a new tab so the user can long-press → "Save to Photos".
 */
export function downloadPng(dataUrl: string, filename: string): void {
  // Detect iOS (iPhone/iPad) — `download` attribute not supported
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPad on iOS 13+ reports as "Macintosh" with touch support
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);

  if (isIOS) {
    // Open in new tab — user can long-press the image → "Save to Photos"
    const newTab = window.open();
    if (newTab) {
      newTab.document.write(
        `<html><head><title>${filename}</title></head>` +
        `<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh">` +
        `<img src="${dataUrl}" style="max-width:100%;height:auto" />` +
        `<p style="position:fixed;bottom:16px;left:0;right:0;text-align:center;color:#fff;font-family:system-ui;font-size:14px">` +
        `Long press the image → Save to Photos</p>` +
        `</body></html>`,
      );
      newTab.document.close();
    }
    return;
  }

  // Desktop / Android — Blob object URL triggers a proper file download
  const base64 = dataUrl.split(",")[1];
  if (!base64) return;
  const bytes     = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob      = new Blob([bytes], { type: "image/png" });
  const objectUrl = URL.createObjectURL(blob);

  const link   = document.createElement("a");
  link.href     = objectUrl;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
