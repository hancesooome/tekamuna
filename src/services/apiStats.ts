/**
 * API stats service facade — switches between mock and real based on env.
 */

import { realApiStatsService } from "./apiStatsService";
import { mockApiStatsService } from "./mockApiStatsService";
import type { ApiStatsService } from "@/types/apiStats";

/** Set VITE_USE_MOCK_STATS=true to use mock data instead of Worker endpoints. */
export const apiStats: ApiStatsService =
  import.meta.env.VITE_USE_MOCK_STATS === "true"
    ? mockApiStatsService
    : realApiStatsService;

export const isMockStatsEnabled =
  import.meta.env.VITE_USE_MOCK_STATS === "true";
