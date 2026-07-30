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
import { apiLogger } from "../lib/apiLogger";
import { refreshTavilyQuotaIfStale } from "../lib/quotaFetcher";
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
  fallbackApiKey?: string | undefined,
): Promise<SearchResult[]> {
  const pref = apiLogger.getTavilyPreference();
  let orderedKeys: (string | undefined)[];
  if (pref === "key2") {
    orderedKeys = [fallbackApiKey ?? apiKey, apiKey];
  } else if (pref === "key1") {
    orderedKeys = [apiKey];
  } else {
    orderedKeys = [apiKey, fallbackApiKey];
  }

  const keysToTry = Array.from(
    new Set(orderedKeys.filter((k): k is string => Boolean(k?.trim()))),
  );

  if (keysToTry.length === 0) {
    console.warn("[Tavily] No Tavily API keys configured — skipping web search.");
    apiLogger.log({
      apiName:      "tavily",
      endpoint:     TAVILY_API_URL,
      method:       "POST",
      durationMs:   0,
      success:      false,
      errorMessage: "TAVILY_API_KEY not configured",
    });
    return [];
  }

  // Append "Philippines" to bias Tavily's ranking toward PH content.
  const phQuery =
    /philipp|pilipinas|pilipino/i.test(query)
      ? query
      : `${query} Philippines`;

  const requestBody = {
    query:               phQuery,
    search_depth:        "advanced",
    topic:               "general",
    include_answer:      false,
    include_raw_content: false,
    max_results:         MAX_RESULTS,
    include_domains:     [],
    exclude_domains:     [],
  };

  for (let i = 0; i < keysToTry.length; i++) {
    const currentKey = keysToTry[i];
    // Determine which key this actually is by VALUE, not by index.
    // When pref==="key2", the fallback key is placed at index 0 — so i>0 would
    // incorrectly label it as "TAVILY_API_KEY". Comparing values is always correct.
    const isKey2    = Boolean(fallbackApiKey?.trim()) && currentKey === fallbackApiKey!.trim();
    const keyLabel  = isKey2 ? "TAVILY_API_KEY_2" : "TAVILY_API_KEY";
    const apiName   = isKey2 ? ("tavily2" as const) : ("tavily" as const);

    const headers = {
      "Content-Type":  "application/json",
      Authorization: `Bearer ${currentKey}`,
    };

    try {
      const startMs = Date.now();

      const response = await fetch(TAVILY_API_URL, {
        method:  "POST",
        headers,
        body:    JSON.stringify(requestBody),
      });

      const durationMs = Date.now() - startMs;

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`[Tavily] HTTP ${response.status} (${keyLabel}): ${errBody}`);
        apiLogger.log({
          apiName,
          endpoint:     TAVILY_API_URL,
          method:       "POST",
          durationMs,
          success:      false,
          statusCode:   response.status,
          errorMessage: `[${keyLabel}] ${errBody.slice(0, 400)}`,
          requestHeaders: headers,
          responseBody: errBody,
        });

        // If another key is available, try it
        if (i < keysToTry.length - 1) {
          console.warn(`[Tavily] Key ${keyLabel} failed (${response.status}). Retrying with secondary Tavily API key...`);
          continue;
        }
        return [];
      }

      const data = (await response.json()) as TavilyResponse;

      apiLogger.log({
        apiName,
        endpoint:       TAVILY_API_URL,
        method:         "POST",
        durationMs,
        success:        true,
        statusCode:     response.status,
        requestHeaders: headers,
        responseBody:   { query: data.query, resultCount: data.results?.length ?? 0, keyUsed: keyLabel },
      });

      refreshTavilyQuotaIfStale(currentKey);

      const all = data.results ?? [];
      const phResults = all.filter(isPhRelevant);
      const final = phResults.length >= MIN_PH_RESULTS ? phResults : all;

      console.info(
        `[Tavily] "${phQuery}" (${keyLabel}) → ${all.length} total, ${phResults.length} PH-relevant, using ${final.length}`,
      );

      return final.slice(0, MAX_RESULTS).map(toSearchResult);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Tavily] Request failed (${keyLabel}):`, err);
      apiLogger.log({
        apiName,
        endpoint:     TAVILY_API_URL,
        method:       "POST",
        durationMs:   0,
        success:      false,
        errorMessage: `[${keyLabel}] ${msg}`,
        requestHeaders: headers,
      });

      if (i < keysToTry.length - 1) {
        console.warn(`[Tavily] Key ${keyLabel} error. Retrying with secondary Tavily API key...`);
        continue;
      }
      return [];
    }
  }

  return [];
}
