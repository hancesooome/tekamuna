/**
 * src/components/dashboard/GeminiUsageCard.tsx
 *
 * Displays internally tracked Gemini usage stats (requests + token counts).
 * Since Gemini has no billing API, stats are accumulated in-memory by the Worker
 * from usageMetadata in every Gemini API response.
 * Fetches from /api/stats/gemini-usage.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Sparkles } from "lucide-react";
import { API_BASE_URL } from "@/constants";

interface GeminiUsageData {
  configured: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastRequestTimestamp: string | null;
}

export function GeminiUsageCard() {
  const [data, setData]       = useState<GeminiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/stats/gemini-usage`);
      if (res.ok) {
        const json = (await res.json()) as GeminiUsageData;
        setData(json);
        setLastFetch(new Date().toISOString());
      }
    } catch (err) {
      console.warn("Failed to fetch Gemini usage:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();

  const successRate =
    data && data.totalRequests > 0
      ? Math.round((data.successfulRequests / data.totalRequests) * 100)
      : null;

  const statusLabel =
    !data || !data.configured
      ? "Offline"
      : data.failedRequests > 0 && successRate !== null && successRate < 70
      ? "Warning"
      : "Online";

  const statusStyle: Record<string, string> = {
    Online:  "bg-emerald-50 border-emerald-200 text-emerald-700",
    Warning: "bg-amber-50 border-amber-200 text-amber-700",
    Offline: "bg-slate-100 border-slate-200 text-slate-500",
  };

  return (
    <Card className="border-border/60 shadow-sm bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Gemini Usage
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Internal request &amp; token tracking. Gemini has no billing API — stats are
              accumulated from response metadata by the Worker.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => void fetchUsage()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && !data ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading Gemini usage...
          </div>
        ) : !data || !data.configured ? (
          <div className="rounded-xl border border-dashed border-border/80 p-6 bg-muted/20 flex flex-col items-center justify-center min-h-[160px]">
            <p className="text-sm font-bold text-muted-foreground">Gemini API</p>
            <span className="text-xs text-muted-foreground/60 mt-1">Not Configured</span>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 flex flex-col gap-4">

            {/* Status row */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-foreground">Gemini API (Internal Tracking)</p>
              <Badge variant="outline" className={`text-[10px] font-bold ${statusStyle[statusLabel]}`}>
                {statusLabel}
              </Badge>
            </div>

            {/* Success rate bar */}
            {data.totalRequests > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-bold text-foreground">{successRate}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (successRate ?? 100) < 70
                        ? "bg-red-500"
                        : (successRate ?? 100) < 90
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${successRate ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Request counts */}
            <div className="grid grid-cols-3 gap-2 py-2 text-center border-y border-border/40">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase">Total</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{fmt(data.totalRequests)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase">Success</p>
                <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmt(data.successfulRequests)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase">Failed</p>
                <p className={`text-sm font-bold mt-0.5 ${data.failedRequests > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                  {fmt(data.failedRequests)}
                </p>
              </div>
            </div>

            {/* Token counts */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-2">
                Token Usage
              </p>
              {[
                { label: "Input Tokens",  value: data.inputTokens,  color: "text-blue-500" },
                { label: "Output Tokens", value: data.outputTokens, color: "text-violet-500" },
                { label: "Total Tokens",  value: data.totalTokens,  color: "text-foreground" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className={`font-bold tabular-nums ${item.color}`}>
                    {data.totalTokens > 0 ? fmt(item.value) : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Last request + footnote */}
            <div className="text-[9px] text-muted-foreground/60 text-right pt-2 border-t border-border/20 space-y-0.5">
              {data.lastRequestTimestamp && (
                <p>
                  Last request:{" "}
                  {new Date(data.lastRequestTimestamp).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <p className="italic">
                Resets on Worker restart · Counts text &amp; vision requests
              </p>
            </div>
          </div>
        )}

        {lastFetch && (
          <p className="text-[9px] text-muted-foreground/50 text-right mt-3">
            Dashboard fetched:{" "}
            {new Date(lastFetch).toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
