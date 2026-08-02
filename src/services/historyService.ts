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
 *
 * sessionStorage vs localStorage:
 *   - sessionStorage → cleared when the browser tab is closed (session-scoped)
 *   - localStorage   → persists across browser restarts (permanent until cleared)
 *   We chose sessionStorage so history auto-clears when the user closes the tab —
 *   no personal data lingering unintentionally.
 */

import { HISTORY_STORAGE_KEY, HISTORY_MAX_ENTRIES } from "@/constants";
// HISTORY_STORAGE_KEY  → string key used to read/write from sessionStorage (e.g. "tekamuna_history")
// HISTORY_MAX_ENTRIES  → max number of history entries to keep (e.g. 20)

import type { VerifyResult } from "@/types";
// VerifyResult → the full fact-check result object shape

/**
 * Appends a VerifyResult to the front of the history list.
 * Deduplicates by verifiedAt and caps at HISTORY_MAX_ENTRIES.
 * Silently ignores write errors (e.g. storage quota exceeded).
 *
 * @param result The VerifyResult to prepend to history.
 */
export function appendToHistory(result: VerifyResult): void {
  try {
    // 1. Read whatever is already saved in sessionStorage.
    //    getItem() returns null if the key doesn't exist yet.
    const raw  = sessionStorage.getItem(HISTORY_STORAGE_KEY);

    // 2. Parse the JSON string back into an array. If nothing saved yet, start with [].
    //    We cast to VerifyResult[] — TypeScript trusts us here since we control what was saved.
    const prev: VerifyResult[] = raw ? (JSON.parse(raw) as VerifyResult[]) : [];

    // 3. Build the new history list:
    //    - Put the new result first (newest first order)
    //    - Filter out any existing entry with the same verifiedAt timestamp (deduplication)
    //    - Limit the total count to HISTORY_MAX_ENTRIES using .slice()
    const deduped = [
      result,
      ...prev.filter((h) => h.verifiedAt !== result.verifiedAt),
    ].slice(0, HISTORY_MAX_ENTRIES);

    // 4. Save back to sessionStorage as a JSON string.
    //    JSON.stringify converts the array to a string (e.g. "[{...},{...}]").
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // sessionStorage can throw if:
    //   - Storage quota is exceeded (rare for small data)
    //   - Browser is in a private/incognito mode with storage disabled
    // We silently ignore it — history is a non-critical feature.
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
    // If raw is null (nothing saved) → return []
    // If raw is a JSON string → parse and return the array
    return raw ? (JSON.parse(raw) as VerifyResult[]) : [];
  } catch {
    // If JSON.parse fails (corrupted data) → return empty array gracefully
    return [];
  }
}

/**
 * Removes a single entry from history by its verifiedAt timestamp.
 * Silently ignores errors.
 *
 * @param verifiedAt The verifiedAt string of the entry to remove.
 */
export function deleteFromHistory(verifiedAt: string): void {
  try {
    const prev = loadHistory();
    const next = prev.filter((h) => h.verifiedAt !== verifiedAt);
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Removes all entries from history.
 * Silently ignores errors.
 */
export function clearHistory(): void {
  try {
    sessionStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
