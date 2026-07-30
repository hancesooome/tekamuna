/**
 * Real API stats service — fetches from Worker /api/stats/* endpoints.
 */

import { API_BASE_URL } from "@/constants";
import type {
  ApiAggregate,
  ApiLogEntry,
  ApiStatsService,
  StatsSummary,
  TimelineRange,
  TimelineResponse,
} from "@/types/apiStats";

const BASE = `${API_BASE_URL}/stats`;

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: string }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const realApiStatsService: ApiStatsService = {
  getSummary: () => get<StatsSummary>("/summary"),

  getApis: async () => {
    const data = await get<{ apis: ApiAggregate[] }>("/apis");
    return data.apis;
  },

  getTimeline: (range: TimelineRange) =>
    get<TimelineResponse>(`/timeline?range=${range}`),

  getErrors: async (limit = 10) => {
    const data = await get<{ errors: ApiLogEntry[] }>(`/errors?limit=${limit}`);
    return data.errors;
  },

  getLog: (id: string) => get<ApiLogEntry>(`/logs/${id}`),

  getLogsForApi: async (apiName, limit = 1) => {
    const data = await get<{ logs: ApiLogEntry[] }>(
      `/logs?apiName=${apiName}&limit=${limit}`,
    );
    return data.logs;
  },
};
