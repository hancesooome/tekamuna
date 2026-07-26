/**
 * src/lib/credibility.ts
 *
 * Purpose:
 *   Frontend credibility scoring for display purposes only.
 *   Assigns a 0–100 score and a human-readable category to a source URL
 *   so the UI can render score circles, color badges, and type labels.
 *
 * Responsibilities:
 *   - getCredibility(url) — returns { score, category }
 *   - scoreColor(score)   — Tailwind text color class for the score
 *   - scoreBg(score)      — Tailwind background color class for the score
 *
 * Important:
 *   This is PURELY presentational. The worker has its own credibility module
 *   (worker/services/credibility.ts) that governs AI evidence weighting.
 *   Changes here do NOT affect the fact-checking pipeline.
 *
 * Dependencies: none
 *
 * When to modify:
 *   - Adding new domain rules for score display
 *   - Changing the score tier thresholds
 */

// ── Score table ───────────────────────────────────────────────────────────────
// Listed highest-confidence first; first match wins.

interface DomainRule {
  pattern: string | RegExp; // matched against hostname (no www.)
  score: number;
  category: string;
}

const DOMAIN_RULES: DomainRule[] = [
  // ── PH Supreme Court / judiciary ──────────────────────────────────────────
  { pattern: "sc.judiciary.gov.ph",   score: 99, category: "Judiciary" },
  { pattern: "ombudsman.gov.ph",      score: 98, category: "Government" },
  { pattern: "lawphil.net",           score: 97, category: "Government" },
  // ── PH statistics & official data ─────────────────────────────────────────
  { pattern: "psa.gov.ph",            score: 97, category: "Government" },
  { pattern: "neda.gov.ph",           score: 96, category: "Government" },
  { pattern: "bsp.gov.ph",            score: 96, category: "Government" },
  { pattern: "senate.gov.ph",         score: 95, category: "Government" },
  { pattern: "congress.gov.ph",       score: 95, category: "Government" },
  { pattern: "officialgazette.gov.ph",score: 95, category: "Government" },
  { pattern: "comelec.gov.ph",        score: 95, category: "Government" },
  { pattern: "doj.gov.ph",            score: 94, category: "Government" },
  { pattern: "dfa.gov.ph",            score: 94, category: "Government" },
  { pattern: "doh.gov.ph",            score: 94, category: "Government" },
  { pattern: "deped.gov.ph",          score: 93, category: "Government" },
  { pattern: "ched.gov.ph",           score: 93, category: "Government" },
  { pattern: "dost.gov.ph",           score: 93, category: "Government" },
  { pattern: "pna.gov.ph",            score: 93, category: "Government" },
  { pattern: "dbm.gov.ph",            score: 92, category: "Government" },
  { pattern: "pids.gov.ph",           score: 92, category: "Government" },
  { pattern: "unifast.gov.ph",        score: 92, category: "Government" },
  // ── International authoritative ───────────────────────────────────────────
  { pattern: "icc-cpi.int",           score: 98, category: "International" },
  { pattern: "icj-cij.org",           score: 98, category: "International" },
  { pattern: "un.org",                score: 96, category: "International" },
  { pattern: "who.int",               score: 96, category: "International" },
  { pattern: "worldbank.org",         score: 94, category: "International" },
  { pattern: "imf.org",               score: 94, category: "International" },
  { pattern: "adb.org",               score: 93, category: "International" },
  { pattern: "apnews.com",            score: 92, category: "International" },
  { pattern: "reuters.com",           score: 92, category: "International" },
  { pattern: "bbc.com",               score: 90, category: "International" },
  { pattern: "bbc.co.uk",             score: 90, category: "International" },
  { pattern: "icrc.org",              score: 93, category: "International" },
  // ── PH fact-checkers ──────────────────────────────────────────────────────
  { pattern: "verafiles.org",         score: 93, category: "Fact-checker" },
  { pattern: "tsek.ph",               score: 91, category: "Fact-checker" },
  { pattern: "factcheck.afp.com",     score: 90, category: "Fact-checker" },
  // ── Major PH media ────────────────────────────────────────────────────────
  { pattern: "rappler.com",           score: 88, category: "Media" },
  { pattern: "inquirer.net",          score: 87, category: "Media" },
  { pattern: "newsinfo.inquirer.net", score: 87, category: "Media" },
  { pattern: "philstar.com",          score: 86, category: "Media" },
  { pattern: "gmanetwork.com",        score: 86, category: "Media" },
  { pattern: "abs-cbn.com",           score: 85, category: "Media" },
  { pattern: "news.abs-cbn.com",      score: 85, category: "Media" },
  { pattern: "mb.com.ph",             score: 84, category: "Media" },
  { pattern: "manilatimes.net",       score: 83, category: "Media" },
  { pattern: "businessworld.com.ph",  score: 83, category: "Media" },
  { pattern: "cnn.ph",                score: 83, category: "Media" },
  { pattern: "businessmirror.com.ph", score: 82, category: "Media" },
  { pattern: "sunstar.com.ph",        score: 81, category: "Media" },
  { pattern: "manilastandard.net",    score: 80, category: "Media" },
  { pattern: "interaksyon.com",       score: 79, category: "Media" },
  { pattern: "ptvnews.ph",            score: 82, category: "Media" },
  { pattern: "one.ph",                score: 78, category: "Media" },
  // ── Social / user-generated (low credibility) ─────────────────────────────
  { pattern: "facebook.com",          score: 15, category: "Social Media" },
  { pattern: "twitter.com",           score: 12, category: "Social Media" },
  { pattern: "x.com",                 score: 12, category: "Social Media" },
  { pattern: "youtube.com",           score: 14, category: "Social Media" },
  { pattern: "tiktok.com",            score: 10, category: "Social Media" },
  { pattern: "reddit.com",            score: 18, category: "Social Media" },
  // ── Reference (context only) ──────────────────────────────────────────────
  { pattern: "wikipedia.org",         score: 55, category: "Reference" },
  { pattern: "scribd.com",            score: 20, category: "Reference" },
];

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.toLowerCase();
  }
}

export interface CredibilityInfo {
  score: number;
  category: string;
}

/**
 * Returns the credibility score (0–100) and category label for a URL.
 */
export function getCredibility(url: string): CredibilityInfo {
  const host = getHostname(url);

  for (const rule of DOMAIN_RULES) {
    const pat = rule.pattern;
    if (typeof pat === "string") {
      if (host === pat || host.endsWith(`.${pat}`)) {
        return { score: rule.score, category: rule.category };
      }
    } else {
      if (pat.test(host)) {
        return { score: rule.score, category: rule.category };
      }
    }
  }

  // Any .gov.ph not explicitly listed
  if (host.endsWith(".gov.ph")) return { score: 90, category: "Government" };
  // Any .ph ccTLD not listed
  if (host.endsWith(".ph"))     return { score: 65, category: "Media" };

  return { score: 40, category: "Web" };
}

/**
 * Score → colour class for the circular score badge.
 */
export function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600";
  if (score >= 70) return "text-blue-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

export function scoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-50";
  if (score >= 70) return "bg-blue-50";
  if (score >= 50) return "bg-amber-50";
  return "bg-red-50";
}
