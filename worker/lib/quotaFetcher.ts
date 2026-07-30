/**
 * worker/lib/quotaFetcher.ts
 *
 * Fetches real quota/credit data from external APIs.
 * Results are cached to respect provider rate limits (especially Tavily /usage).
 */

import type { Env } from "../index";
import { apiLogger, type ApiName, type QuotaValue } from "./apiLogger";

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS: Record<string, number> = {
  tavily:      5 * 60_000,  // Tavily /usage: 10 req / 10 min
  openrouter:  60_000,
};

interface CacheEntry {
  value: QuotaValue;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(key: string, ttlMs: number): QuotaValue | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) return null;
  return entry.value;
}

function setCached(key: string, value: QuotaValue): QuotaValue {
  cache.set(key, { value, fetchedAt: Date.now() });
  apiLogger.setQuotaCache(keyToApiName(key), value);
  return value;
}

function keyToApiName(key: string): ApiName {
  if (key.startsWith("tavily:")) return "tavily";
  if (key.includes(":key2")) return "openrouter2";
  return "openrouter";
}

// ── Header parsers (inline from responses — no extra API calls) ───────────────

/** Parse Gemini x-ratelimit-* request quota headers. */
export function parseGeminiQuotaHeaders(headers: Headers): QuotaValue | undefined {
  const remaining = headers.get("x-ratelimit-remaining-requests");
  const limit     = headers.get("x-ratelimit-limit-requests");
  if (remaining !== null && limit !== null) {
    const r = Number(remaining);
    const l = Number(limit);
    if (Number.isFinite(r) && Number.isFinite(l) && l > 0) {
      return Math.max(0, Math.min(100, Math.round((r / l) * 100)));
    }
  }

  const remainingTokens = headers.get("x-ratelimit-remaining-tokens");
  const limitTokens     = headers.get("x-ratelimit-limit-tokens");
  if (remainingTokens !== null && limitTokens !== null) {
    const r = Number(remainingTokens);
    const l = Number(limitTokens);
    if (Number.isFinite(r) && Number.isFinite(l) && l > 0) {
      return {
        label: `${Math.round(r / 1000)}k/${Math.round(l / 1000)}k tokens/min`,
      };
    }
  }

  return undefined;
}

/** Parse OpenRouter X-RateLimit-* headers (present on 429 responses). */
export function parseOpenRouterRateLimitHeaders(headers: Headers): QuotaValue | undefined {
  const remaining = headers.get("x-ratelimit-remaining");
  const limit     = headers.get("x-ratelimit-limit");
  if (remaining !== null && limit !== null) {
    const r = Number(remaining);
    const l = Number(limit);
    if (Number.isFinite(r) && Number.isFinite(l) && l > 0) {
      return Math.max(0, Math.min(100, Math.round((r / l) * 100)));
    }
  }
  return undefined;
}

// ── Remote quota fetchers ───────────────────────────────────────────────────────





export interface OpenRouterDetailedUsage {
  configured: boolean;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  percentage: number;
  lastUpdated: string;
}

interface OpenRouterCreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
}

interface OpenRouterKeyResponse {
  data?: {
    limit?: number | null;
    usage?: number;
    limit_remaining?: number | null;
  };
}

const orDetailedCache = new Map<string, { value: OpenRouterDetailedUsage; fetchedAt: number }>();
const OR_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache

export async function fetchOpenRouterDetailedUsage(
  apiKey: string | undefined,
  cacheSuffix: string,
): Promise<OpenRouterDetailedUsage> {
  if (!apiKey?.trim()) {
    return {
      configured: false,
      totalCredits: 0,
      usedCredits: 0,
      remainingCredits: 0,
      percentage: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const cleanKey = apiKey.trim();
  const cacheKey = `detailed:${cacheSuffix}`;
  const cached = orDetailedCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < OR_CACHE_TTL_MS) {
    return cached.value;
  }

  // Fallback data helper
  const makeFallback = (limit = 0, usage = 0, remaining = 0) => {
    const total = limit;
    const remainingVal = remaining;
    const pct = total > 0 ? Math.round((remainingVal / total) * 100) : 0;
    return {
      configured: true,
      totalCredits: total,
      usedCredits: usage,
      remainingCredits: remainingVal,
      percentage: pct,
      lastUpdated: new Date().toISOString(),
    };
  };

  try {
    // 1. Try GET /credits (Primary Account balance)
    const creditsResponse = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${cleanKey}` },
    });

    if (creditsResponse.ok) {
      const data = (await creditsResponse.json()) as OpenRouterCreditsResponse;
      if (data?.data) {
        const total = data.data.total_credits ?? 0;
        const used = data.data.total_usage ?? 0;
        const remaining = Math.max(0, total - used);
        const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0;

        const result: OpenRouterDetailedUsage = {
          configured: true,
          totalCredits: total,
          usedCredits: used,
          remainingCredits: remaining,
          percentage,
          lastUpdated: new Date().toISOString(),
        };

        orDetailedCache.set(cacheKey, { value: result, fetchedAt: Date.now() });

        // Update standard cache
        setCached(
          `openrouter:${cacheSuffix}`,
          total > 0 ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) : "unlimited",
        );

        return result;
      }
    }

    // 2. Fallback to GET /key (Key specific limits)
    const keyResponse = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${cleanKey}` },
    });

    if (keyResponse.ok) {
      const data = (await keyResponse.json()) as OpenRouterKeyResponse;
      if (data?.data) {
        const limit = data.data.limit ?? 0;
        const usage = data.data.usage ?? 0;
        const remaining = data.data.limit_remaining ?? Math.max(0, limit - usage);

        const result = makeFallback(limit, usage, remaining);
        orDetailedCache.set(cacheKey, { value: result, fetchedAt: Date.now() });

        setCached(
          `openrouter:${cacheSuffix}`,
          limit > 0 ? Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))) : "unlimited",
        );

        return result;
      }
    }

    throw new Error("Both credits and key API checks failed");
  } catch (err) {
    console.error(`[OpenRouter] Failed to fetch usage for ${cacheSuffix}:`, err);
    if (cached) return cached.value;
    return {
      configured: true,
      totalCredits: 0,
      usedCredits: 0,
      remainingCredits: 0,
      percentage: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function fetchOpenRouterQuota(apiKey: string, cacheSuffix: string): Promise<QuotaValue> {
  const cacheKey = `openrouter:${cacheSuffix}`;
  const cached = getCached(cacheKey, CACHE_TTL_MS.openrouter);
  if (cached !== null) return cached;

  try {
    const detailed = await fetchOpenRouterDetailedUsage(apiKey, cacheSuffix);
    if (!detailed.configured) return "unknown";
    return detailed.totalCredits > 0 ? detailed.percentage : "unlimited";
  } catch {
    return "unknown";
  }
}

export interface TavilyDetailedUsage {
  configured: boolean;
  plan: string;
  usage: number;
  limit: number;
  remaining: number;
  percentage: number;
  breakdown: {
    search: number;
    extract: number;
    crawl: number;
    map: number;
    research: number;
  };
  lastUpdated: string;
}

interface TavilyOfficialUsageResponse {
  key?: {
    usage?: number;
    limit?: number | null;
    search_usage?: number;
    extract_usage?: number;
    crawl_usage?: number;
    map_usage?: number;
    research_usage?: number;
  };
  account?: {
    current_plan?: string;
    plan_usage?: number;
    plan_limit?: number;
  };
}

const detailedCache = new Map<string, { value: TavilyDetailedUsage; fetchedAt: number }>();
const DETAILED_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function fetchTavilyDetailedUsage(apiKey: string | undefined): Promise<TavilyDetailedUsage> {
  if (!apiKey?.trim()) {
    return {
      configured: false,
      plan: "N/A",
      usage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      breakdown: { search: 0, extract: 0, crawl: 0, map: 0, research: 0 },
      lastUpdated: new Date().toISOString(),
    };
  }

  const cleanKey = apiKey.trim();
  const cacheKey = `detailed:${cleanKey.slice(-8)}`;
  const cached = detailedCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < DETAILED_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const response = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${cleanKey}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = (await response.json()) as TavilyOfficialUsageResponse;
    const key = data.key;
    const account = data.account;

    if (!key) {
      throw new Error("Invalid response format: missing key info");
    }

    const limit = key.limit ?? 0;
    const usage = key.usage ?? 0;
    const remaining = Math.max(0, limit - usage);
    const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;

    const result: TavilyDetailedUsage = {
      configured: true,
      plan: account?.current_plan ?? "Free",
      usage,
      limit,
      remaining,
      percentage,
      breakdown: {
        search: key.search_usage ?? 0,
        extract: key.extract_usage ?? 0,
        crawl: key.crawl_usage ?? 0,
        map: key.map_usage ?? 0,
        research: key.research_usage ?? 0,
      },
      lastUpdated: new Date().toISOString(),
    };

    detailedCache.set(cacheKey, { value: result, fetchedAt: Date.now() });

    // Also update the simple quota percentage cache for standard apiLogger
    const simpleCacheKey = `tavily:${cleanKey.slice(-8)}`;
    setCached(simpleCacheKey, limit > 0 ? Math.max(0, Math.min(100, Math.round(((limit - usage) / limit) * 100))) : "unlimited");

    return result;
  } catch (err) {
    console.error("[Tavily] Failed to fetch detailed usage:", err);
    // Return stale cache if available, otherwise a fallback object
    if (cached) {
      return cached.value;
    }
    return {
      configured: true,
      plan: "Unknown",
      usage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      breakdown: { search: 0, extract: 0, crawl: 0, map: 0, research: 0 },
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function fetchTavilyQuota(apiKey: string): Promise<QuotaValue> {
  const cacheKey = `tavily:${apiKey.slice(-8)}`;
  const cached = getCached(cacheKey, CACHE_TTL_MS.tavily);
  if (cached !== null) return cached;

  try {
    const detailed = await fetchTavilyDetailedUsage(apiKey);
    if (!detailed.configured) return "unknown";
    return detailed.limit > 0 ? detailed.percentage : "unlimited";
  } catch {
    return "unknown";
  }
}

/** Refresh Tavily quota after a search if cache is stale (fire-and-forget). */
export function refreshTavilyQuotaIfStale(apiKey: string): void {
  const cacheKey = `tavily:${apiKey.slice(-8)}`;
  if (getCached(cacheKey, CACHE_TTL_MS.tavily) !== null) return;
  void fetchTavilyDetailedUsage(apiKey);
}

/** Refresh all configured API quotas (called by stats endpoints). */
export async function refreshQuotasFromEnv(env: Env): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (env.TAVILY_API_KEY?.trim()) {
    tasks.push(fetchTavilyQuota(env.TAVILY_API_KEY.trim()));
  }
  if (env.TAVILY_API_KEY_2?.trim()) {
    tasks.push(fetchTavilyQuota(env.TAVILY_API_KEY_2.trim()));
  }
  if (env.OPENROUTER_API_KEY?.trim()) {
    tasks.push(fetchOpenRouterQuota(env.OPENROUTER_API_KEY.trim(), "key1"));
  }
  if (env.OPENROUTER_API_KEY_2?.trim()) {
    tasks.push(fetchOpenRouterQuota(env.OPENROUTER_API_KEY_2.trim(), "key2"));
  }

  await Promise.allSettled(tasks);
}
