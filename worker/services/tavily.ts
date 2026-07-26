/**
 * Tavily Search service — Philippines-first, single-pass.
 *
 * Strategy:
 *   1. Always append "Philippines" to the query (if not already present) so
 *      Tavily's ranking biases toward Philippine content.
 *   2. After results come back, post-filter: keep results that come from a
 *      known PH domain OR mention a PH-related keyword in their title/content.
 *   3. If post-filtering leaves fewer than MIN_PH_RESULTS, fall back to the
 *      unfiltered set (better to show some results than none).
 *
 * Single-pass keeps the implementation simple and avoids double API usage.
 *
 * Graceful fallback:
 *   - TAVILY_API_KEY absent/blank → returns [], logs warning
 *   - Non-2xx response           → returns [], logs full error body
 *   - Network / parse failure    → returns [], logs error
 */

import type { SearchResult } from "../../src/types/verify";

// ── Tavily wire-format ────────────────────────────────────────────────────────

interface TavilyRawResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  results: TavilyRawResult[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TAVILY_API_URL = "https://api.tavily.com/search";
const MAX_RESULTS = 10;
const MIN_PH_RESULTS = 3;

/**
 * Hostnames of Philippine media, fact-checkers, and government portals.
 */
const PH_DOMAINS = new Set([
  // Government
  "gov.ph", "officialgazette.gov.ph", "psa.gov.ph", "neda.gov.ph",
  "doh.gov.ph", "deped.gov.ph", "ched.gov.ph", "dost.gov.ph",
  "bsp.gov.ph", "senate.gov.ph", "congress.gov.ph", "lawphil.net",
  "unifast.gov.ph", "pna.gov.ph", "pia.gov.ph", "dbm.gov.ph",
  "pidswebs.pids.gov.ph", "pids.gov.ph",
  // News
  "rappler.com", "inquirer.net", "newsinfo.inquirer.net", "philstar.com",
  "gmanetwork.com", "abs-cbn.com", "mb.com.ph", "businessmirror.com.ph",
  "sunstar.com.ph", "manilatimes.net", "businessworld.com.ph",
  "cnn.ph", "interaksyon.com", "philnews.ph",
  // Fact-checkers
  "verafiles.org", "tsek.ph",
]);

/**
 * Keywords that signal Philippine relevance.
 */
const PH_KEYWORDS = [
  "philippines", "pilipinas", "pilipino", "filipino", "filipina",
  "manila", "metro manila", "mindanao", "visayas", "luzon",
  "duterte", "marcos", "aquino", "comelec", "bangko sentral",
  "republic act", " ra ", "ra no.", "philippine law",
  "ph peso", "philippine peso", "₱",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSearchResult(raw: TavilyRawResult): SearchResult {
  return {
    title: raw.title ?? "",
    url: raw.url ?? "",
    content: raw.content ?? "",
    score: typeof raw.score === "number" ? raw.score : 0,
    publishedDate: raw.published_date ?? "",
    ...(raw.raw_content ? { rawContent: raw.raw_content } : {}),
  };
}

function isPhDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // Exact match or subdomain match (e.g. newsinfo.inquirer.net → inquirer.net)
    if (PH_DOMAINS.has(host)) return true;
    for (const d of PH_DOMAINS) {
      if (host.endsWith(`.${d}`)) return true;
    }
    // Any .gov.ph subdomain
    if (host.endsWith(".gov.ph")) return true;
    // Any .ph ccTLD
    if (host.endsWith(".ph")) return true;
    return false;
  } catch {
    return false;
  }
}

function hasPhKeyword(result: TavilyRawResult): boolean {
  const haystack = `${result.title} ${result.content.slice(0, 400)}`.toLowerCase();
  return PH_KEYWORDS.some((kw) => haystack.includes(kw));
}

function isPhRelevant(result: TavilyRawResult): boolean {
  return isPhDomain(result.url) || hasPhKeyword(result);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function searchWeb(
  query: string,
  apiKey: string | undefined,
): Promise<SearchResult[]> {
  if (!apiKey?.trim()) {
    console.warn("[Tavily] TAVILY_API_KEY not configured — skipping web search.");
    return [];
  }

  // Append "Philippines" so Tavily's ranking biases toward PH content,
  // unless the query already contains a Philippines keyword.
  const phQuery =
    /philipp|pilipinas|pilipino/i.test(query)
      ? query
      : `${query} Philippines`;

  const requestBody = {
    query: phQuery,
    search_depth: "advanced",
    topic: "general",
    include_answer: false,
    include_raw_content: false,
    max_results: MAX_RESULTS,
    include_domains: [],
    exclude_domains: [],
  };

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Tavily] HTTP ${response.status}: ${errBody}`);
      return [];
    }

    const data = (await response.json()) as TavilyResponse;
    const all = data.results ?? [];

    // Post-filter: prefer PH-relevant results
    const phResults = all.filter(isPhRelevant);
    const final = phResults.length >= MIN_PH_RESULTS ? phResults : all;

    console.info(
      `[Tavily] "${phQuery}" → ${all.length} total, ${phResults.length} PH-relevant, using ${final.length}`,
    );

    return final.slice(0, MAX_RESULTS).map(toSearchResult);
  } catch (err) {
    console.error("[Tavily] Request failed:", err);
    return [];
  }
}
