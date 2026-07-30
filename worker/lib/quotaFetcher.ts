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

interface OpenRouterKeyData {
  limit?: number | null;
  limit_remaining?: number | null;
  limit_reset?: string | null;
  usage?: number;
  usage_daily?: number;
  is_free_tier?: boolean;
}

interface TavilyUsageKey {
  usage?: number;
  limit?: number | null;
}

interface TavilyUsageResponse {
  key?: TavilyUsageKey;
  account?: {
    plan_usage?: number;
    plan_limit?: number;
  };
}

export async function fetchOpenRouterQuota(apiKey: string, cacheSuffix: string): Promise<QuotaValue> {
  const cacheKey = `openrouter:${cacheSuffix}`;
  const cached = getCached(cacheKey, CACHE_TTL_MS.openrouter);
  if (cached !== null) return cached;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) return "unknown";

    const json = (await response.json()) as { data?: OpenRouterKeyData };
    const data = json.data;
    if (!data) return "unknown";

    // Per-key credit cap → show as percent
    if (data.limit != null && data.limit > 0 && data.limit_remaining != null) {
      return setCached(
        cacheKey,
        Math.max(0, Math.min(100, Math.round((data.limit_remaining / data.limit) * 100))),
      );
    }

    // Remaining credits without a configured cap
    if (data.limit_remaining != null && data.limit == null) {
      return setCached(cacheKey, {
        label: `$${data.limit_remaining.toFixed(2)} credits left`,
      });
    }

    // Unlimited credit cap (paid, no spending limit on key)
    if (data.limit === null && data.limit_remaining === null && !data.is_free_tier) {
      return setCached(cacheKey, "unlimited");
    }

    // Free-tier daily request budget for :free models
    const dailyLimit = data.is_free_tier ? 50 : 1000;
    const usedToday  = data.usage_daily ?? 0;
    const remaining  = Math.max(0, dailyLimit - usedToday);
    return setCached(cacheKey, {
      label: `${remaining}/${dailyLimit} free req today`,
    });
  } catch {
    return "unknown";
  }
}

export async function fetchTavilyQuota(apiKey: string): Promise<QuotaValue> {
  const cacheKey = `tavily:${apiKey.slice(-8)}`;
  const cached = getCached(cacheKey, CACHE_TTL_MS.tavily);
  if (cached !== null) return cached;

  try {
    const response = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) return "unknown";

    const data = (await response.json()) as TavilyUsageResponse;
    const key  = data.key;

    if (!key) return "unknown";

    if (key.limit == null) {
      return setCached(cacheKey, "unlimited");
    }

    const usage = key.usage ?? 0;
    const limit = key.limit;
    if (limit <= 0) return setCached(cacheKey, "unlimited");

    const remainingPct = Math.max(0, Math.min(100, Math.round(((limit - usage) / limit) * 100)));
    return setCached(cacheKey, remainingPct);
  } catch {
    return "unknown";
  }
}

/** Refresh Tavily quota after a search if cache is stale (fire-and-forget). */
export function refreshTavilyQuotaIfStale(apiKey: string): void {
  const cacheKey = `tavily:${apiKey.slice(-8)}`;
  if (getCached(cacheKey, CACHE_TTL_MS.tavily) !== null) return;
  void fetchTavilyQuota(apiKey);
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
