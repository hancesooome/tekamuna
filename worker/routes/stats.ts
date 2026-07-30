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
import { refreshQuotasFromEnv } from "../lib/quotaFetcher";

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
    openrouter:  Boolean(env.OPENROUTER_API_KEY?.trim()),
    openrouter2: Boolean(env.OPENROUTER_API_KEY_2?.trim()),
    gemini:      Boolean(env.GEMINI_API_KEY?.trim()),
  });
}

const VALID_RANGES = new Set<TimelineRange>(["1h", "today", "7d", "30d"]);

export async function handleStats(request: Request, env: Env): Promise<Response> {
  syncConfigFromEnv(env);

  const url = new URL(request.url);
  const path = url.pathname;

  // Refresh live quota from provider APIs before returning aggregate stats
  if (path === "/api/stats/summary" || path === "/api/stats/apis") {
    await refreshQuotasFromEnv(env);
  }

  if (path === "/api/stats/summary") {
    return jsonResponse(apiLogger.getSummary(), 200);
  }

  if (path === "/api/stats/apis") {
    return jsonResponse({ apis: apiLogger.getAggregates() }, 200);
  }

  if (path === "/api/stats/timeline") {
    const range = (url.searchParams.get("range") ?? "today") as TimelineRange;
    if (!VALID_RANGES.has(range)) {
      return jsonResponse({ error: "Invalid range." }, 400);
    }
    return jsonResponse(
      { range, points: apiLogger.getTimeline(range) },
      200,
    );
  }

  if (path === "/api/stats/errors") {
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit") ?? 10)),
    );
    return jsonResponse({ errors: apiLogger.getRecentErrors(limit) }, 200);
  }

  if (path === "/api/stats/logs") {
    const apiName = url.searchParams.get("apiName");
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 1)));
    if (apiName) {
      const logs = apiLogger.getLogsForApi(apiName as ApiName, limit);
      return jsonResponse({ logs }, 200);
    }
    return jsonResponse({ error: "apiName required." }, 400);
  }

  const logMatch = path.match(/^\/api\/stats\/logs\/([^/]+)$/);
  if (logMatch) {
    const entry = apiLogger.getLogById(logMatch[1]);
    if (!entry) {
      return jsonResponse({ error: "Log not found." }, 404);
    }
    return jsonResponse(entry, 200);
  }

  return jsonResponse({ error: "Not found." }, 404);
}
