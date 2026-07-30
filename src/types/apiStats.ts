/**
 * Shared types for the API usage dashboard.
 * Mirrors worker/lib/apiLogger.ts response shapes.
 */

export type ApiName = "tavily" | "openrouter" | "openrouter2" | "gemini";

export type ApiHealthStatus = "healthy" | "slow" | "offline" | "disabled";

export type TimelineRange = "1h" | "today" | "7d" | "30d";

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

export interface TimelineResponse {
  range: TimelineRange;
  points: TimelinePoint[];
}

export interface ApiStatsService {
  getSummary(): Promise<StatsSummary>;
  getApis(): Promise<ApiAggregate[]>;
  getTimeline(range: TimelineRange): Promise<TimelineResponse>;
  getErrors(limit?: number): Promise<ApiLogEntry[]>;
  getLog(id: string): Promise<ApiLogEntry>;
  getLogsForApi(apiName: ApiName, limit?: number): Promise<ApiLogEntry[]>;
}
