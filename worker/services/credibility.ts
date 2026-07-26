/**
 * TekaNga Source Credibility Scoring
 *
 * CORE PRINCIPLE (from spec):
 *   - Source credibility affects CONFIDENCE only.
 *   - Evidence (what sources say) determines TRUTH.
 *   - We NEVER exclude a source from analysis based on credibility alone.
 *   - All sources from Tavily are passed to the AI for evidence extraction.
 *   - Credibility scores are attached as metadata so the AI can weight them.
 *
 * This module provides:
 *   scoreSource(url)  → 0–100 credibility score + category label
 *   buildSourceIndex  → attaches credibility scores to all search results
 *   credibilityRulesPrompt → injected into AI system prompt
 */

import type { SearchResult, Source } from "../../src/types/verify";

// ── Score tiers ───────────────────────────────────────────────────────────────

interface DomainRule {
  domain: string;   // matched as exact hostname or *.domain
  score: number;
  category: string;
}

const DOMAIN_RULES: DomainRule[] = [
  // ── PH judiciary / law ────────────────────────────────────────────────────
  { domain: "sc.judiciary.gov.ph",    score: 99, category: "Judiciary" },
  { domain: "ombudsman.gov.ph",       score: 98, category: "Government" },
  { domain: "lawphil.net",            score: 97, category: "Government" },
  // ── PH statistics & official data ────────────────────────────────────────
  { domain: "psa.gov.ph",             score: 97, category: "Government" },
  { domain: "neda.gov.ph",            score: 96, category: "Government" },
  { domain: "bsp.gov.ph",             score: 96, category: "Government" },
  { domain: "senate.gov.ph",          score: 95, category: "Government" },
  { domain: "congress.gov.ph",        score: 95, category: "Government" },
  { domain: "officialgazette.gov.ph", score: 95, category: "Government" },
  { domain: "comelec.gov.ph",         score: 95, category: "Government" },
  { domain: "doj.gov.ph",             score: 94, category: "Government" },
  { domain: "dfa.gov.ph",             score: 94, category: "Government" },
  { domain: "doh.gov.ph",             score: 94, category: "Government" },
  { domain: "fda.gov.ph",             score: 93, category: "Government" },
  { domain: "deped.gov.ph",           score: 93, category: "Government" },
  { domain: "ched.gov.ph",            score: 93, category: "Government" },
  { domain: "dost.gov.ph",            score: 93, category: "Government" },
  { domain: "pna.gov.ph",             score: 93, category: "Government" },
  { domain: "dbm.gov.ph",             score: 92, category: "Government" },
  { domain: "pids.gov.ph",            score: 92, category: "Government" },
  { domain: "unifast.gov.ph",         score: 92, category: "Government" },
  { domain: "pia.gov.ph",             score: 91, category: "Government" },
  { domain: "ndrrmc.gov.ph",          score: 91, category: "Government" },
  { domain: "pagasa.dost.gov.ph",     score: 91, category: "Government" },
  // ── International authoritative ──────────────────────────────────────────
  { domain: "icc-cpi.int",            score: 98, category: "International" },
  { domain: "icj-cij.org",            score: 98, category: "International" },
  { domain: "un.org",                 score: 96, category: "International" },
  { domain: "who.int",                score: 96, category: "International" },
  { domain: "unicef.org",             score: 95, category: "International" },
  { domain: "worldbank.org",          score: 94, category: "International" },
  { domain: "imf.org",                score: 94, category: "International" },
  { domain: "adb.org",                score: 93, category: "International" },
  { domain: "apnews.com",             score: 92, category: "International" },
  { domain: "reuters.com",            score: 92, category: "International" },
  { domain: "bbc.com",                score: 90, category: "International" },
  { domain: "bbc.co.uk",              score: 90, category: "International" },
  { domain: "icrc.org",               score: 93, category: "International" },
  { domain: "unhcr.org",              score: 93, category: "International" },
  { domain: "undp.org",               score: 92, category: "International" },
  // ── Medical / scientific ──────────────────────────────────────────────────
  { domain: "ncbi.nlm.nih.gov",       score: 95, category: "Scientific" },
  { domain: "nih.gov",                score: 94, category: "Scientific" },
  { domain: "cdc.gov",                score: 94, category: "Scientific" },
  { domain: "pubmed.gov",             score: 94, category: "Scientific" },
  { domain: "who.int",                score: 96, category: "Scientific" },
  // ── Academic ─────────────────────────────────────────────────────────────
  { domain: "harvard.edu",            score: 93, category: "Academic" },
  { domain: "mit.edu",                score: 93, category: "Academic" },
  { domain: "stanford.edu",           score: 93, category: "Academic" },
  { domain: "up.edu.ph",              score: 90, category: "Academic" },
  { domain: "admu.edu.ph",            score: 88, category: "Academic" },
  { domain: "dlsu.edu.ph",            score: 87, category: "Academic" },
  // ── PH fact-checkers ─────────────────────────────────────────────────────
  { domain: "verafiles.org",          score: 93, category: "Fact-checker" },
  { domain: "tsek.ph",                score: 91, category: "Fact-checker" },
  { domain: "factcheck.afp.com",      score: 90, category: "Fact-checker" },
  // ── Major PH media ────────────────────────────────────────────────────────
  { domain: "rappler.com",            score: 88, category: "Media" },
  { domain: "inquirer.net",           score: 87, category: "Media" },
  { domain: "newsinfo.inquirer.net",  score: 87, category: "Media" },
  { domain: "philstar.com",           score: 86, category: "Media" },
  { domain: "gmanetwork.com",         score: 86, category: "Media" },
  { domain: "abs-cbn.com",            score: 85, category: "Media" },
  { domain: "news.abs-cbn.com",       score: 85, category: "Media" },
  { domain: "mb.com.ph",              score: 84, category: "Media" },
  { domain: "manilatimes.net",        score: 83, category: "Media" },
  { domain: "businessworld.com.ph",   score: 83, category: "Media" },
  { domain: "cnn.ph",                 score: 83, category: "Media" },
  { domain: "businessmirror.com.ph",  score: 82, category: "Media" },
  { domain: "sunstar.com.ph",         score: 81, category: "Media" },
  { domain: "manilastandard.net",     score: 80, category: "Media" },
  { domain: "interaksyon.com",        score: 79, category: "Media" },
  { domain: "ptvnews.ph",             score: 82, category: "Media" },
  { domain: "one.ph",                 score: 78, category: "Media" },
  { domain: "philnews.ph",            score: 75, category: "Media" },
  { domain: "abante.com.ph",          score: 70, category: "Media" },
  // ── Reference / general web ──────────────────────────────────────────────
  { domain: "wikipedia.org",          score: 55, category: "Reference" },
  { domain: "hrw.org",                score: 72, category: "NGO" },
  { domain: "amnesty.org",            score: 71, category: "NGO" },
  // ── Social / user-generated ───────────────────────────────────────────────
  { domain: "facebook.com",           score: 20, category: "Social Media" },
  { domain: "instagram.com",          score: 18, category: "Social Media" },
  { domain: "twitter.com",            score: 18, category: "Social Media" },
  { domain: "x.com",                  score: 18, category: "Social Media" },
  { domain: "youtube.com",            score: 22, category: "Social Media" },
  { domain: "tiktok.com",             score: 12, category: "Social Media" },
  { domain: "reddit.com",             score: 25, category: "Social Media" },
  // ── Low credibility ───────────────────────────────────────────────────────
  { domain: "scribd.com",             score: 30, category: "Document Share" },
  { domain: "slideshare.net",         score: 28, category: "Document Share" },
  { domain: "medium.com",             score: 35, category: "Blog" },
  { domain: "blogspot.com",           score: 20, category: "Blog" },
  { domain: "wordpress.com",          score: 20, category: "Blog" },
  { domain: "substack.com",           score: 30, category: "Blog" },
  { domain: "quora.com",              score: 20, category: "Forum" },
];

// ── Hostname helper ───────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// ── Public scoring API ────────────────────────────────────────────────────────

export interface CredibilityScore {
  score: number;     // 0–100
  category: string;
}

/**
 * Returns a credibility score and category for any URL.
 * Every URL gets a score — this is never used to exclude sources.
 */
export function scoreSource(url: string): CredibilityScore {
  const host = getHostname(url);
  if (!host) return { score: 30, category: "Unknown" };

  for (const rule of DOMAIN_RULES) {
    if (host === rule.domain || host.endsWith(`.${rule.domain}`)) {
      return { score: rule.score, category: rule.category };
    }
  }

  // Catch-all: any *.gov.ph not explicitly listed
  if (host.endsWith(".gov.ph")) return { score: 90, category: "Government" };
  // Any .ph ccTLD
  if (host.endsWith(".ph"))     return { score: 65, category: "Media" };
  // Any .edu domain
  if (host.endsWith(".edu"))    return { score: 75, category: "Academic" };
  // Any .edu.ph
  if (host.endsWith(".edu.ph")) return { score: 80, category: "Academic" };

  // Default — unknown site, still gets shown, just lower weight
  return { score: 40, category: "Web" };
}

/**
 * Attaches credibility metadata to every SearchResult and converts it to
 * a Source object. ALL results are returned — nothing is filtered out.
 */
export function buildScoredSourceIndex(
  results: SearchResult[],
): Map<string, Source & { credibilityScore: number; credibilityCategory: string }> {
  const map = new Map<string, Source & { credibilityScore: number; credibilityCategory: string }>();
  for (const r of results) {
    const { score, category } = scoreSource(r.url);
    map.set(r.url, {
      title:               r.title,
      url:                 r.url,
      sourceName:          getHostname(r.url),
      publishedDate:       r.publishedDate ?? "",
      summary:             r.content.slice(0, 400),
      credibilityScore:    score,
      credibilityCategory: category,
    });
  }
  return map;
}

/**
 * System prompt section injected into AI prompts.
 * Explains the evidence-first approach clearly.
 */
export function credibilityRulesPrompt(): string {
  return `
EVIDENCE-FIRST RULES (mandatory):

1. VERDICT is determined by EVIDENCE (what sources say), NOT by source credibility.
   - If 5 low-credibility sources all independently report the same verifiable fact, that IS evidence.
   - If only 1 high-credibility source supports a claim, treat it as weak evidence.

2. SOURCE CREDIBILITY affects CONFIDENCE only.
   - Use the credibilityScore (0-100) provided for each source to weight confidence.
   - High credibility sources (80+) carry more weight in confidence calculation.
   - Low credibility sources (below 50) carry less weight.

3. INCLUDE ALL SOURCES in your analysis, regardless of credibility score.
   - Even low-score sources (Wikipedia, social media, blogs) may contain relevant evidence.
   - Mention them in reliableSources so users can read them directly.
   - Only exclude from supportingEvidence/contradictingEvidence if the content itself is not factual evidence (opinion, rumor, unverified claim).

4. CONFIDENCE FORMULA (approximate):
   - Start with: evidence agreement across sources (40%)
   - Add: number of independent source confirmations (25%)
   - Add: weighted average credibility of confirming sources (20%)
   - Add: recency of sources (10%)
   - Add: completeness of evidence (5%)

5. VERDICT RULES:
   - "true"        → ≥2 independent sources provide verifiable evidence supporting the claim
   - "false"       → credible evidence directly contradicts the claim
   - "misleading"  → claim has factual basis but is exaggerated, out of context, or incomplete
   - "unverified"  → insufficient or contradictory evidence to reach a conclusion

6. If NO sources contain relevant evidence at all → verdict must be "unverified", confidence ≤ 40.
`.trim();
}
