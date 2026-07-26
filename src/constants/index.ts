/**
 * src/constants/index.ts
 *
 * Purpose:
 *   Single source of truth for all application-level constants.
 *   No magic strings, hardcoded URLs, or storage keys anywhere else in src/.
 *
 * Responsibilities:
 *   - App branding (name, mascot URL)
 *   - sessionStorage key names
 *   - API base URL
 *   - Category labels
 *   - Verdict display labels
 *
 * When to modify:
 *   - Rebranding the app
 *   - Changing the mascot CDN host
 *   - Adding a new sessionStorage key
 *   - Adding a new claim category
 *
 * Dependencies: none (this file has zero imports)
 */

// ── Branding ──────────────────────────────────────────────────────────────────

export const APP_NAME = "Teka Muna";
export const APP_TAGLINE = "AI Fact-Checker";

/**
 * Mascot image URL hosted on Supabase CDN.
 * Used in Navbar, HomePage hero, AboutPage, and CTA section.
 *
 * To change the mascot: update this single constant.
 */
export const MASCOT_URL =
  "https://zodkmcvqdfhqmvnkzzfm.supabase.co/storage/v1/object/public/assets/solo-nobg.png";

/**
 * Logo icon URL — used in the Navbar circle and browser favicon.
 * This is the full icon with background, distinct from the transparent mascot.
 */
export const LOGO_ICON_URL =
  "https://zodkmcvqdfhqmvnkzzfm.supabase.co/storage/v1/object/public/assets/icon.png";

// ── Storage keys ──────────────────────────────────────────────────────────────
// All sessionStorage keys are defined here to avoid collision and make
// clearing storage predictable (just reference these constants).

/** Stores the most recent VerifyResult — read by ResultPage on mount. */
export const RESULT_STORAGE_KEY  = "teka_verify_result";

/** Stores the user's verification history — array of VerifyResult. */
export const HISTORY_STORAGE_KEY = "teka_history";

/** Maximum number of history entries to keep in sessionStorage. */
export const HISTORY_MAX_ENTRIES = 50;

// ── API ───────────────────────────────────────────────────────────────────────
/**
 * Base URL for all worker API calls.
 * In dev: Vite proxies /api → localhost:8787 (wrangler dev).
 * In prod: the Worker is bound to the same Pages domain under /api/*.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

// ── Claim categories ──────────────────────────────────────────────────────────

export const CATEGORIES = [
  "Pulitika",
  "Kalusugan",
  "Ekonomiya",
  "Teknolohiya",
  "Kalikasan",
  "Edukasyon",
  "Krimen",
  "Internasyonal",
] as const;

export type Category = (typeof CATEGORIES)[number];

// ── Filter categories (History page) ─────────────────────────────────────────

export const FILTER_CATEGORIES = [
  "Lahat",
  "Pulitika",
  "Kalusugan",
  "Ekonomiya",
  "Teknolohiya",
  "Kalikasan",
  "Edukasyon",
  "Kasaysayan",
] as const;

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

// ── Verdict display labels ────────────────────────────────────────────────────

/** Human-readable Filipino label for each verdict value. */
export const VERDICT_LABELS: Record<string, string> = {
  true:       "Totoo",
  false:      "Hindi Totoo",
  misleading: "Mapanlinlang",
  unverified: "Hindi Ma-verify",
};

/**
 * Tailwind color name associated with each verdict.
 * Used to build dynamic class names (e.g. `text-${VERDICT_COLORS[verdict]}-600`).
 */
export const VERDICT_COLORS: Record<string, string> = {
  true:       "emerald",
  false:      "red",
  misleading: "amber",
  unverified: "slate",
};

// ── History keyword → category mapping ───────────────────────────────────────
// Used by inferCategory() in HistoryPage to assign a display category
// to claims that don't have one stored.

export const CATEGORY_KEYWORD_MAP: Record<string, string> = {
  "Ang Pilipinas ay may pinakamabilis": "Teknolohiya",
  "Libre ang tuition":                  "Edukasyon",
  "Fernando Poe":                       "Kasaysayan",
  "West Philippine Sea":                "Pulitika",
  "BRICS":                              "Pulitika",
  "Siargao":                            "Kalikasan",
  "vaccine":                            "Kalusugan",
  "bakuna":                             "Kalusugan",
  "COVID":                              "Kalusugan",
  "ekonomiya":                          "Ekonomiya",
  "unemployment":                       "Ekonomiya",
  "eleksyon":                           "Pulitika",
  "comelec":                            "Pulitika",
};
