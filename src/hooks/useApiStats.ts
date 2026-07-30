/**
 * TanStack Query hooks for the API usage dashboard.
 */

import { useQuery } from "@tanstack/react-query";
import { apiStats } from "@/services/apiStats";
import type { TimelineRange } from "@/types/apiStats";

const REFETCH_MS = 30_000;

export function useApiStatsSummary() {
  return useQuery({
    queryKey: ["api-stats", "summary"],
    queryFn:  () => apiStats.getSummary(),
    refetchInterval: REFETCH_MS,
  });
}

export function useApiStatsApis() {
  return useQuery({
    queryKey: ["api-stats", "apis"],
    queryFn:  () => apiStats.getApis(),
    refetchInterval: REFETCH_MS,
  });
}

export function useApiStatsTimeline(range: TimelineRange) {
  return useQuery({
    queryKey: ["api-stats", "timeline", range],
    queryFn:  () => apiStats.getTimeline(range),
    refetchInterval: REFETCH_MS,
  });
}

export function useApiStatsErrors(limit = 10) {
  return useQuery({
    queryKey: ["api-stats", "errors", limit],
    queryFn:  () => apiStats.getErrors(limit),
    refetchInterval: REFETCH_MS,
  });
}

export function useApiLog(id: string | null) {
  return useQuery({
    queryKey: ["api-stats", "log", id],
    queryFn:  () => apiStats.getLog(id!),
    enabled:  Boolean(id),
  });
}
