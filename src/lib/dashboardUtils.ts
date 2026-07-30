/**
 * Dashboard utility helpers.
 */

import type { ApiHealthStatus, QuotaValue } from "@/types/apiStats";

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function formatQuota(quota: QuotaValue): string {
  if (quota === "unlimited") return "Unlimited";
  if (quota === "unknown") return "Unknown";
  if (typeof quota === "object" && "label" in quota) return quota.label;
  return `${quota}%`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_LABELS: Record<ApiHealthStatus, string> = {
  healthy:  "Healthy",
  slow:     "Slow",
  offline:  "Offline",
  disabled: "Disabled",
};

export const STATUS_STYLES: Record<ApiHealthStatus, string> = {
  healthy:  "border-emerald-200 bg-emerald-50 text-emerald-700",
  slow:     "border-amber-200 bg-amber-50 text-amber-700",
  offline:  "border-red-200 bg-red-50 text-red-700",
  disabled: "border-slate-200 bg-slate-100 text-slate-500",
};

export const STATUS_DOT: Record<ApiHealthStatus, string> = {
  healthy:  "bg-emerald-500",
  slow:     "bg-amber-500",
  offline:  "bg-red-500",
  disabled: "bg-slate-400",
};
