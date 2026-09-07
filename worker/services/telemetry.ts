import type { Env } from "../index";
import type { ApiLogEntry, ApiName, QuotaValue } from "../lib/apiLogger";

export interface SearchHistoryEntry {
  id: string;
  claim: string;
  claimNormalized: string;
  category: string | null;
  verdict: "true" | "false" | "misleading" | "unverified" | null;
  confidence: number | null;
  cached: boolean;
  status: "completed" | "failed";
  errorMessage: string | null;
  createdAt: string;
}

function credentials(env: Env): { url: string; key: string } | null {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function hasValidAdminSession(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!token || !url || !anonKey) return false;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function persistApiLog(env: Env, entry: ApiLogEntry): Promise<void> {
  const config = credentials(env);
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/api_usage_logs`, {
    method: "POST",
    headers: headers(config.key),
    body: JSON.stringify({
      id: entry.id,
      api_name: entry.apiName,
      endpoint: entry.endpoint,
      method: entry.method,
      duration_ms: entry.durationMs,
      success: entry.success,
      status_code: entry.statusCode ?? null,
      error_message: entry.errorMessage?.slice(0, 2000) ?? null,
      quota_remaining: entry.quotaRemaining ?? null,
      created_at: entry.timestamp,
    }),
  });
  if (!response.ok) throw new Error(`Telemetry insert failed (${response.status})`);
}

interface ApiLogRow {
  id: string; api_name: ApiName; endpoint: string; method: string;
  duration_ms: number; success: boolean; status_code: number | null;
  error_message: string | null; quota_remaining: QuotaValue | null; created_at: string;
}

function mapApiLog(row: ApiLogRow): ApiLogEntry {
  return {
    id: row.id, apiName: row.api_name, endpoint: row.endpoint, method: row.method,
    timestamp: row.created_at, durationMs: row.duration_ms, success: row.success,
    statusCode: row.status_code ?? undefined, errorMessage: row.error_message ?? undefined,
    quotaRemaining: row.quota_remaining ?? undefined,
  };
}

export async function fetchApiLogs(
  env: Env,
  options: { since?: string; apiName?: ApiName; success?: boolean; id?: string; limit?: number } = {},
): Promise<ApiLogEntry[] | null> {
  const config = credentials(env);
  if (!config) return null;
  const params = new URLSearchParams({
    select: "id,api_name,endpoint,method,duration_ms,success,status_code,error_message,quota_remaining,created_at",
    order: "created_at.desc",
    limit: String(Math.min(5000, Math.max(1, options.limit ?? 1000))),
  });
  if (options.since) params.set("created_at", `gte.${options.since}`);
  if (options.apiName) params.set("api_name", `eq.${options.apiName}`);
  if (options.success !== undefined) params.set("success", `eq.${options.success}`);
  if (options.id) params.set("id", `eq.${options.id}`);
  const response = await fetch(`${config.url}/rest/v1/api_usage_logs?${params}`, { headers: headers(config.key) });
  if (!response.ok) return null;
  const rows = await response.json() as ApiLogRow[];
  return rows.map(mapApiLog).reverse();
}

export async function persistSearch(
  env: Env,
  input: Omit<SearchHistoryEntry, "id" | "createdAt">,
): Promise<void> {
  const config = credentials(env);
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/user_search_history`, {
    method: "POST",
    headers: headers(config.key),
    body: JSON.stringify({
      claim: input.claim,
      claim_normalized: input.claimNormalized,
      category: input.category,
      verdict: input.verdict,
      confidence: input.confidence,
      cached: input.cached,
      status: input.status,
      error_message: input.errorMessage?.slice(0, 2000) ?? null,
    }),
  });
  if (!response.ok) throw new Error(`Search history insert failed (${response.status})`);
}

export async function fetchRecentSearches(env: Env, limit = 50): Promise<SearchHistoryEntry[] | null> {
  const config = credentials(env);
  if (!config) return null;
  const params = new URLSearchParams({ select: "*", order: "created_at.desc", limit: String(Math.min(100, limit)) });
  const response = await fetch(`${config.url}/rest/v1/user_search_history?${params}`, { headers: headers(config.key) });
  if (!response.ok) return null;
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id), claim: String(row.claim), claimNormalized: String(row.claim_normalized),
    category: row.category ? String(row.category) : null,
    verdict: (row.verdict ? String(row.verdict) : null) as SearchHistoryEntry["verdict"],
    confidence: row.confidence === null ? null : Number(row.confidence), cached: Boolean(row.cached),
    status: String(row.status) as SearchHistoryEntry["status"],
    errorMessage: row.error_message ? String(row.error_message) : null, createdAt: String(row.created_at),
  }));
}
