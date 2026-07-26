/**
 * worker/utils/hostname.ts
 *
 * Purpose:
 *   Shared hostname extraction utility for the Worker layer.
 *   Eliminates the same inline function defined in 5+ worker files.
 *
 * Dependencies: none
 */

/**
 * Extracts the bare hostname from a URL, stripping the www. prefix.
 * Returns the original string if parsing fails.
 *
 * @param url  A full URL string (e.g. "https://www.rappler.com/article/123")
 * @returns    Bare hostname (e.g. "rappler.com")
 */
export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}
