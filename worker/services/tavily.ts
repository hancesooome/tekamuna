/**
 * Tavily Search service — Philippines-first, single-pass.
 *
 * Tavily is an AI-optimised web search API (alternative to Google Search API).
 * We send a query and receive a list of relevant web page excerpts.
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
// SearchResult is our internal type (not Tavily's raw format).
// toSearchResult() below converts Tavily's format → our SearchResult.

// ── Tavily wire-format ────────────────────────────────────────────────────────
// These interfaces describe exactly what Tavily sends back in JSON.
// "wire-format" = the raw data format sent over the network (before we transform it).

interface TavilyRawResult {
  title:           string;
  url:             string;
  content:         string;  // Tavily's excerpted snippet
  raw_content?:    string;  // Full page content (only if requested — we don't request it)
  score:           number;  // Relevance score 0–1 (higher = more relevant to query)
  published_date?: string;  // Note: snake_case (Tavily's convention), we convert to camelCase
}

interface TavilyResponse {
  query:   string;
  results: TavilyRawResult[]; // Array of search results
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TAVILY_API_URL = "https://api.tavily.com/search"; // Tavily's REST API endpoint
const MAX_RESULTS    = 10;   // Max results to request from Tavily (and return to caller)
const MIN_PH_RESULTS = 3;    // Min number of PH-filtered results before falling back to unfiltered

/**
 * Hostnames of Philippine media, fact-checkers, and government portals.
 * We use a Set for O(1) lookup — faster than an array for has() checks.
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
 * Lowercase only — we lowercase the content before checking.
 */
const PH_KEYWORDS = [
  "philippines", "pilipinas", "pilipino", "filipino", "filipina",
  "manila", "metro manila", "mindanao", "visayas", "luzon",
  "duterte", "marcos", "aquino", "comelec", "bangko sentral",
  "republic act", " ra ", "ra no.", "philippine law",
  "ph peso", "philippine peso", "₱",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts Tavily's raw result format (snake_case) to our SearchResult (camelCase).
 * Using ?? "" ensures we never store undefined — always a string.
 */
function toSearchResult(raw: TavilyRawResult): SearchResult {
  return {
    title:         raw.title         ?? "",   // ?? = nullish coalescing: use "" if null/undefined
    url:           raw.url           ?? "",
    content:       raw.content       ?? "",
    score:         typeof raw.score === "number" ? raw.score : 0, // guard against non-numbers
    publishedDate: raw.published_date ?? "",   // snake_case → camelCase conversion
    ...(raw.raw_content ? { rawContent: raw.raw_content } : {}),
    // Spread syntax: only adds rawContent to the object if raw_content exists.
    // {} is an empty object — spreading nothing if raw_content is absent.
  };
}

/**
 * Returns true if the URL's hostname is a known Philippine domain.
 * Handles: exact match, subdomain match, any .gov.ph, any .ph ccTLD.
 */
function isPhDomain(url: string): boolean {
  try {
    // new URL(url).hostname extracts "www.inquirer.net" from "https://www.inquirer.net/article"
    // .replace(/^www\./, "") strips the "www." prefix → "inquirer.net"
    const host = new URL(url).hostname.replace(/^www\./, "");

    // Exact match: "rappler.com" is in PH_DOMAINS → true
    if (PH_DOMAINS.has(host)) return true;

    // Subdomain match: "newsinfo.inquirer.net" → check if it ends with ".inquirer.net"
    // This catches any subdomain of a known PH domain.
    for (const d of PH_DOMAINS) {
      if (host.endsWith(`.${d}`)) return true;
    }

    // Any subdomain of .gov.ph qualifies (e.g. "dswd.gov.ph")
    if (host.endsWith(".gov.ph")) return true;

    // Any .ph ccTLD (country-code top-level domain for Philippines)
    if (host.endsWith(".ph")) return true;

    return false;
  } catch {
    // new URL() throws if the URL is malformed — return false instead of crashing
    return false;
  }
}

/**
 * Returns true if the title or content excerpt mentions a Philippine keyword.
 * We only check the first 400 chars of content to avoid slow string searches.
 */
function hasPhKeyword(result: TavilyRawResult): boolean {
  // Template literal combines title + first 400 chars of content into one string
  // .toLowerCase() normalises casing so "Philippines" matches "philippines"
  const haystack = `${result.title} ${result.content.slice(0, 400)}`.toLowerCase();
  // .some() returns true if ANY keyword in PH_KEYWORDS appears in haystack
  return PH_KEYWORDS.some((kw) => haystack.includes(kw));
}

/**
 * A result is PH-relevant if it comes from a known PH domain OR
 * its text content mentions a PH keyword.
 */
function isPhRelevant(result: TavilyRawResult): boolean {
  return isPhDomain(result.url) || hasPhKeyword(result);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Searches the web via Tavily and returns up to MAX_RESULTS SearchResults.
 *
 * @param query   The claim text to search for.
 * @param apiKey  The Tavily API key from environment variables.
 * @returns       Array of SearchResult objects (may be empty on failure).
 */
export async function searchWeb(
  query: string,
  apiKey: string | undefined,
): Promise<SearchResult[]> {

  // Guard: don't attempt search if the API key is missing.
  // ?. = optional chaining; .trim() removes whitespace; if falsy → skip.
  if (!apiKey?.trim()) {
    console.warn("[Tavily] TAVILY_API_KEY not configured — skipping web search.");
    return []; // Return empty array instead of throwing
  }

  // Append "Philippines" to bias Tavily's ranking toward PH content.
  // Unless the query already mentions Philippines/Pilipinas (to avoid redundancy).
  // /philipp|pilipinas|pilipino/i → case-insensitive regex test
  const phQuery =
    /philipp|pilipinas|pilipino/i.test(query)
      ? query                        // already has PH keyword → use as-is
      : `${query} Philippines`;      // add Philippines to the end

  // Build the Tavily API request body.
  const requestBody = {
    query:               phQuery,
    search_depth:        "advanced",   // "advanced" → Tavily does deeper crawling
    topic:               "general",
    include_answer:      false,        // We don't need Tavily's AI-generated summary
    include_raw_content: false,        // Don't include full page HTML (saves bandwidth)
    max_results:         MAX_RESULTS,
    include_domains:     [],           // [] = no domain whitelist
    exclude_domains:     [],           // [] = no domain blacklist
  };

  try {
    // Send POST request to Tavily's API.
    // Authorization: Bearer <token> is the standard way to pass API keys in HTTP headers.
    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`, // Template literal inserts the API key
      },
      body: JSON.stringify(requestBody),
    });

    // If status is not 2xx, log the error body and return empty.
    // response.text() reads the raw response body as a string (for error logging).
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Tavily] HTTP ${response.status}: ${errBody}`);
      return [];
    }

    // Parse the response JSON and cast it to our TavilyResponse type.
    const data = (await response.json()) as TavilyResponse;

    // ?? [] ensures we don't crash if `results` is missing from the response.
    const all = data.results ?? [];

    // Post-filter: keep only results relevant to Philippines.
    const phResults = all.filter(isPhRelevant);

    // If we found enough PH-specific results, use them.
    // Otherwise fall back to all results (better than nothing).
    const final = phResults.length >= MIN_PH_RESULTS ? phResults : all;

    console.info(
      `[Tavily] "${phQuery}" → ${all.length} total, ${phResults.length} PH-relevant, using ${final.length}`,
    );

    // Limit to MAX_RESULTS and convert each Tavily result to our SearchResult type.
    return final.slice(0, MAX_RESULTS).map(toSearchResult);

  } catch (err) {
    // Catches network errors (DNS failure, timeout, etc.) and JSON parse errors.
    console.error("[Tavily] Request failed:", err);
    return []; // Graceful fallback — never throw from this function
  }
}
