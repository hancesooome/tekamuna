/**
 * src/services/historyService.ts
 *
 * Purpose:
 *   Manages the user's verification history stored in sessionStorage.
 *   Centralises all read/write access to the history key so no page
 *   component accesses sessionStorage directly.
 *
 * Responsibilities:
 *   - Append a new result to history (called after every successful verify)
 *   - Load history from sessionStorage (called by HistoryPage on mount)
 *   - Deduplicate entries by verifiedAt timestamp
 *   - Cap history at HISTORY_MAX_ENTRIES
 *
 * Dependencies:
 *   - src/constants/index.ts  (HISTORY_STORAGE_KEY, HISTORY_MAX_ENTRIES)
 *   - src/types/verify.ts     (VerifyResult)
 *
 * When to modify:
 *   - Switching from sessionStorage to localStorage or IndexedDB
 *   - Adding history sync to a remote backend
 *   - Changing the deduplication strategy
 */

import { HISTORY_STORAGE_KEY, HISTORY_MAX_ENTRIES } from "@/constants";
import type { VerifyResult } from "@/types";

/**
 * Appends a VerifyResult to the front of the history list.
 * Deduplicates by verifiedAt and caps at HISTORY_MAX_ENTRIES.
 * Silently ignores write errors (e.g. storage quota exceeded).
 *
 * @param result The VerifyResult to prepend to history.
 */
export function appendToHistory(result: VerifyResult): void {
  try {
    const raw  = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    const prev: VerifyResult[] = raw ? (JSON.parse(raw) as VerifyResult[]) : [];
    const deduped = [
      result,
      ...prev.filter((h) => h.verifiedAt !== result.verifiedAt),
    ].slice(0, HISTORY_MAX_ENTRIES);
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // Ignore — non-critical feature
  }
}

/**
 * Loads the full history array from sessionStorage.
 * Returns an empty array if storage is empty or corrupted.
 *
 * @returns Array of VerifyResult, newest first.
 */
export function loadHistory(): VerifyResult[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VerifyResult[]) : [];
  } catch {
    return [];
  }
}
