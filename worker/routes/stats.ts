/**
 * worker/routes/stats.ts
 *
 * Dashboard stats endpoints — all read from the centralized apiLogger.
 */

import type { Env } from "../index";
import {
  apiLogger,
  type ApiName,
  type TimelineRange,
} from "../lib/apiLogger";
import {
  refreshQuotasFromEnv,
  fetchTavilyDetailedUsage,
  fetchOpenRouterDetailedUsage,
} from "../lib/quotaFetcher";
import { fetchApiLogs, fetchRecentSearches, hasValidAdminSession } from "../services/telemetry";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function syncConfigFromEnv(env: Env): void {
  apiLogger.setConfigStatus({
    tavily:      Boolean(env.TAVILY_API_KEY?.trim()),
    tavily2:     Boolean(env.TAVILY_API_KEY_2?.trim()),
    openrouter:  Boolean(env.OPENROUTER_API_KEY?.trim()),
    openrouter2: Boolean(env.OPENROUTER_API_KEY_2?.trim()),
    groq:        Boolean(env.GROQ_API_KEY?.trim()),
    gemini:      Boolean(env.GEMINI_API_KEY?.trim()),
  });
}

const VALID_RANGES = new Set<TimelineRange>(["1h", "today", "7d", "30d"]);

export async function handleStats(request: Request, env: Env): Promise<Response> {
  if (!await hasValidAdminSession(request, env)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }
  syncConfigFromEnv(env);

  const url = new URL(request.url);
  const path = url.pathname;

  // Refresh live quota from provider APIs before returning aggregate stats
  if (path === "/api/stats/summary" || path === "/api/stats/apis") {
    await refreshQuotasFromEnv(env);
  }

  if (path === "/api/stats/tavily-config") {
    if (request.method === "POST") {
      try {
        const body = (await request.json()) as { preferredKey?: "auto" | "key1" | "key2" };
        if (body.preferredKey && ["auto", "key1", "key2"].includes(body.preferredKey)) {
          apiLogger.setTavilyPreference(body.preferredKey);
        }
      } catch {
        // ignore
      }
    }
    return jsonResponse(
      {
        preferredKey: apiLogger.getTavilyPreference(),
        key1Configured: Boolean(env.TAVILY_API_KEY?.trim()),
        key2Configured: Boolean(env.TAVILY_API_KEY_2?.trim()),
      },
      200,
    );
  }

  if (path === "/api/stats/tavily-usage" && request.method === "GET") {
    const [key1Data, key2Data] = await Promise.all([
      fetchTavilyDetailedUsage(env.TAVILY_API_KEY),
      fetchTavilyDetailedUsage(env.TAVILY_API_KEY_2),
    ]);
    return jsonResponse({ key1: key1Data, key2: key2Data }, 200);
  }

  if (path === "/api/stats/openrouter-usage" && request.method === "GET") {
    const [key1Data, key2Data] = await Promise.all([
      fetchOpenRouterDetailedUsage(env.OPENROUTER_API_KEY, "key1"),
      fetchOpenRouterDetailedUsage(env.OPENROUTER_API_KEY_2, "key2"),
    ]);
    return jsonResponse({ key1: key1Data, key2: key2Data }, 200);
  }

  if (path === "/api/stats/gemini-usage" && request.method === "GET") {
    const stats = apiLogger.getGeminiUsageStats();
    return jsonResponse({
      configured: Boolean(env.GEMINI_API_KEY?.trim()),
      ...stats,
    }, 200);
  }

  if (path === "/api/stats/summary") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const logs = await fetchApiLogs(env, { since: start.toISOString(), limit: 5000 });
    return jsonResponse(apiLogger.getSummary(logs ?? undefined), 200);
  }

  if (path === "/api/stats/apis") {
    const logs = await fetchApiLogs(env, { limit: 5000 });
    return jsonResponse({ apis: apiLogger.getAggregates(logs ?? undefined) }, 200);
  }

  if (path === "/api/stats/timeline") {
    const range = (url.searchParams.get("range") ?? "today") as TimelineRange;
    if (!VALID_RANGES.has(range)) {
      return jsonResponse({ error: "Invalid range." }, 400);
    }
    const rangeMs: Record<TimelineRange, number> = {
      "1h": 60 * 60_000,
      today: 24 * 60 * 60_000,
      "7d": 7 * 24 * 60 * 60_000,
      "30d": 30 * 24 * 60 * 60_000,
    };
    const logs = await fetchApiLogs(env, {
      since: new Date(Date.now() - rangeMs[range]).toISOString(),
      limit: 5000,
    });
    return jsonResponse(
      { range, points: apiLogger.getTimeline(range, logs ?? undefined) },
      200,
    );
  }

  if (path === "/api/stats/errors") {
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit") ?? 10)),
    );
    const logs = await fetchApiLogs(env, { success: false, limit });
    return jsonResponse({ errors: apiLogger.getRecentErrors(limit, logs ?? undefined) }, 200);
  }

  if (path === "/api/stats/searches") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
    const searches = await fetchRecentSearches(env, limit);
    return jsonResponse({ searches: searches ?? [] }, 200);
  }

  if (path === "/api/stats/logs") {
    const apiName = url.searchParams.get("apiName");
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 1)));
    if (apiName) {
      const persisted = await fetchApiLogs(env, { apiName: apiName as ApiName, limit });
      return jsonResponse({ logs: apiLogger.getLogsForApi(apiName as ApiName, limit, persisted ?? undefined) }, 200);
    }
    return jsonResponse({ error: "apiName required." }, 400);
  }

  const logMatch = path.match(/^\/api\/stats\/logs\/([^/]+)$/);
  if (logMatch) {
    const persisted = await fetchApiLogs(env, { id: logMatch[1], limit: 1 });
    const entry = apiLogger.getLogById(logMatch[1], persisted ?? undefined);
    if (!entry) {
      return jsonResponse({ error: "Log not found." }, 404);
    }
    return jsonResponse(entry, 200);
  }

  return jsonResponse({ error: "Not found." }, 404);
}
