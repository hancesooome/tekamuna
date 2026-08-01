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
 * Why not just `link.href = dataUrl`?
 * Mobile Safari and some Android browsers ignore the `download` attribute
 * when the href is a `data:` URL — they open the raw base64 string, and
 * the OS sniffs it as `.txt` because there's no Content-Type header.
 *
 * Fix: convert to a Blob and use a `blob:` object URL instead.
 * Object URLs carry the correct MIME type so the browser always prompts
 * to save a `.png` file.
 */
export function downloadPng(dataUrl: string, filename: string): void {
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
  // Release memory after enough time for the download to start
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
