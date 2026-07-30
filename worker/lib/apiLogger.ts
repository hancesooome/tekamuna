/**
 * worker/lib/apiLogger.ts
 *
 * Centralized API usage logger — single source of truth for all external API calls.
 * All wrappers (Tavily, AIManager providers) must log through this module.
 *
 * State is in-memory per Worker isolate. Swap the store implementation later
 * for D1/KV without changing callers.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiName = "tavily" | "openrouter" | "openrouter2" | "gemini";

export type ApiHealthStatus = "healthy" | "slow" | "offline" | "disabled";

export type TimelineRange = "1h" | "today" | "7d" | "30d";

/** Percent (0–100), sentinel strings, or a human-readable label from the provider. */
export type QuotaValue = number | "unlimited" | "unknown" | { label: string };

export interface ApiLogEntry {
  id: string;
  apiName: ApiName;
  endpoint: string;
  method: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  quotaRemaining?: QuotaValue;
  requestHeaders?: Record<string, string>;
  responseBody?: unknown;
}

export interface ApiAggregate {
  apiName: ApiName;
  displayName: string;
  status: ApiHealthStatus;
  requests: number;
  success: number;
  failed: number;
  avgResponseMs: number;
  lastUsedAt: string | null;
  quotaRemaining: QuotaValue;
}

export interface StatsSummary {
  requestsToday: number;
  successRate: number;
  avgResponseMs: number;
  errorsToday: number;
}

export interface TimelinePoint {
  time: string;
  label: string;
  requests: number;
}

export interface ApiConfigStatus {
  tavily: boolean;
  openrouter: boolean;
  openrouter2: boolean;
  gemini: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LOGS = 500;
const SLOW_THRESHOLD_MS = 1500;
const OFFLINE_FAILURE_STREAK = 3;

const API_DISPLAY_NAMES: Record<ApiName, string> = {
  tavily:      "Tavily",
  openrouter:  "OpenRouter",
  openrouter2: "OpenRouter (Key 2)",
  gemini:      "Gemini API",
};

const ALL_APIS: ApiName[] = ["tavily", "openrouter", "openrouter2", "gemini"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] =
      key.toLowerCase() === "authorization"
        ? "Bearer [REDACTED]"
        : value;
  }
  return out;
}

function truncateBody(body: unknown, maxLen = 4000): unknown {
  if (body === undefined || body === null) return body;
  const str = typeof body === "string" ? body : JSON.stringify(body);
  if (str.length <= maxLen) {
    try {
      return typeof body === "string" ? JSON.parse(body) : body;
    } catch {
      return str;
    }
  }
  return { _truncated: true, preview: str.slice(0, maxLen) };
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isToday(iso: string): boolean {
  return new Date(iso).getTime() >= startOfToday();
}

function deriveStatus(
  apiName: ApiName,
  configured: boolean,
  logs: ApiLogEntry[],
): ApiHealthStatus {
  if (!configured) return "disabled";

  const apiLogs = logs.filter((l) => l.apiName === apiName);
  if (apiLogs.length === 0) return "healthy";

  const recent = apiLogs.slice(-OFFLINE_FAILURE_STREAK);
  const allRecentFailed =
    recent.length >= OFFLINE_FAILURE_STREAK &&
    recent.every((l) => !l.success);

  if (allRecentFailed) return "offline";

  const last = apiLogs[apiLogs.length - 1];
  if (!last.success) {
    const msg = (last.errorMessage ?? "").toLowerCase();
    if (msg.includes("timeout") || msg.includes("network")) return "offline";
  }

  const successful = apiLogs.filter((l) => l.success);
  if (successful.length === 0) return "offline";

  const avgMs =
    successful.reduce((sum, l) => sum + l.durationMs, 0) / successful.length;

  if (avgMs >= SLOW_THRESHOLD_MS) return "slow";
  return "healthy";
}

// ── Logger singleton ────────────────────────────────────────────────────────────

class ApiLogger {
  private logs: ApiLogEntry[] = [];
  /** Latest quota fetched from provider APIs or response headers. */
  private quotaCache = new Map<ApiName, QuotaValue>();
  private configStatus: ApiConfigStatus = {
    tavily:      false,
    openrouter:  false,
    openrouter2: false,
    gemini:      false,
  };

  setConfigStatus(status: ApiConfigStatus): void {
    this.configStatus = status;
  }

  /** Store quota from a provider API poll or inline response headers. */
  setQuotaCache(apiName: ApiName, value: QuotaValue): void {
    this.quotaCache.set(apiName, value);
  }

  getQuotaCache(apiName: ApiName): QuotaValue | undefined {
    return this.quotaCache.get(apiName);
  }

  log(input: Omit<ApiLogEntry, "id" | "timestamp">): ApiLogEntry {
    const entry: ApiLogEntry = {
      ...input,
      id:        generateId(),
      timestamp: new Date().toISOString(),
      requestHeaders: input.requestHeaders
        ? redactHeaders(input.requestHeaders)
        : undefined,
      responseBody: input.responseBody !== undefined
        ? truncateBody(input.responseBody)
        : undefined,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
    return entry;
  }

  /**
   * Wraps an async API call with automatic logging.
   */
  async track<T>(params: {
    apiName: ApiName;
    endpoint: string;
    method: string;
    headers?: Record<string, string>;
    execute: () => Promise<{
      success: boolean;
      statusCode?: number;
      errorMessage?: string;
      responseBody?: unknown;
      quotaRemaining?: QuotaValue;
      durationMs?: number;
    }>;
  }): Promise<T> {
    const startMs = Date.now();

    try {
      const result = await params.execute();
      const durationMs = result.durationMs ?? Date.now() - startMs;

      this.log({
        apiName:        params.apiName,
        endpoint:       params.endpoint,
        method:         params.method,
        durationMs,
        success:        result.success,
        statusCode:     result.statusCode,
        errorMessage:   result.errorMessage,
        quotaRemaining: result.quotaRemaining,
        requestHeaders: params.headers,
        responseBody:   result.responseBody,
      });

      if (!result.success) {
        throw new Error(result.errorMessage ?? "API request failed");
      }

      return result as T;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const msg = err instanceof Error ? err.message : String(err);

      // Avoid double-logging if execute already logged via throw after logging
      const last = this.logs[this.logs.length - 1];
      const alreadyLogged =
        last &&
        last.apiName === params.apiName &&
        Date.now() - new Date(last.timestamp).getTime() < 50;

      if (!alreadyLogged) {
        this.log({
          apiName:        params.apiName,
          endpoint:       params.endpoint,
          method:         params.method,
          durationMs,
          success:        false,
          errorMessage:   msg,
          requestHeaders: params.headers,
        });
      }

      throw err;
    }
  }

  getLogById(id: string): ApiLogEntry | undefined {
    return this.logs.find((l) => l.id === id);
  }

  getRecentErrors(limit = 10): ApiLogEntry[] {
    return [...this.logs]
      .filter((l) => !l.success)
      .slice(-limit)
      .reverse();
  }

  getLogsForApi(apiName: ApiName, limit = 50): ApiLogEntry[] {
    return this.logs.filter((l) => l.apiName === apiName).slice(-limit);
  }

  getSummary(): StatsSummary {
    const todayLogs = this.logs.filter((l) => isToday(l.timestamp));
    const total = todayLogs.length;
    const successes = todayLogs.filter((l) => l.success).length;
    const errors = todayLogs.filter((l) => !l.success).length;
    const avgMs =
      total === 0
        ? 0
        : Math.round(
            todayLogs.reduce((sum, l) => sum + l.durationMs, 0) / total,
          );

    return {
      requestsToday: total,
      successRate:   total === 0 ? 100 : Math.round((successes / total) * 1000) / 10,
      avgResponseMs: avgMs,
      errorsToday:   errors,
    };
  }

  getAggregates(): ApiAggregate[] {
    return ALL_APIS.map((apiName) => {
      const apiLogs = this.logs.filter((l) => l.apiName === apiName);
      const configured = this.configStatus[apiName];
      const successes = apiLogs.filter((l) => l.success);
      const failed = apiLogs.filter((l) => !l.success);

      const avgResponseMs =
        successes.length === 0
          ? 0
          : Math.round(
              successes.reduce((sum, l) => sum + l.durationMs, 0) /
                successes.length,
            );

      const lastLog = apiLogs[apiLogs.length - 1];
      const lastLogQuota = [...apiLogs]
        .reverse()
        .find((l) => l.quotaRemaining !== undefined);

      const quotaRemaining = !configured
        ? ({ label: "N/A" } as const)
        : this.quotaCache.get(apiName) ??
          lastLogQuota?.quotaRemaining ??
          "unknown";

      return {
        apiName,
        displayName:    API_DISPLAY_NAMES[apiName],
        status:         deriveStatus(apiName, configured, this.logs),
        requests:       apiLogs.length,
        success:        successes.length,
        failed:         failed.length,
        avgResponseMs,
        lastUsedAt:     lastLog?.timestamp ?? null,
        quotaRemaining,
      };
    });
  }

  getTimeline(range: TimelineRange): TimelinePoint[] {
    const now = Date.now();
    let bucketMs: number;
    let bucketCount: number;
    let formatLabel: (d: Date) => string;

    switch (range) {
      case "1h":
        bucketMs = 5 * 60 * 1000;
        bucketCount = 12;
        formatLabel = (d) =>
          d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
        break;
      case "today":
        bucketMs = 60 * 60 * 1000;
        bucketCount = 24;
        formatLabel = (d) =>
          d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
        break;
      case "7d":
        bucketMs = 24 * 60 * 60 * 1000;
        bucketCount = 7;
        formatLabel = (d) =>
          d.toLocaleDateString("en-PH", { weekday: "short" });
        break;
      case "30d":
        bucketMs = 24 * 60 * 60 * 1000;
        bucketCount = 30;
        formatLabel = (d) =>
          d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
        break;
    }

    const startMs = now - bucketMs * bucketCount;
    const buckets: TimelinePoint[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = startMs + i * bucketMs;
      const bucketEnd = bucketStart + bucketMs;
      const d = new Date(bucketStart);

      const count = this.logs.filter((l) => {
        const t = new Date(l.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      }).length;

      buckets.push({
        time:     new Date(bucketStart).toISOString(),
        label:    formatLabel(d),
        requests: count,
      });
    }

    return buckets;
  }
}

export const apiLogger = new ApiLogger();
