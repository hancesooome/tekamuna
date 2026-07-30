/**
 * src/components/dashboard/OpenRouterUsageCard.tsx
 *
 * Displays live OpenRouter credit usage for Key 1 and Key 2.
 * Fetches from /api/stats/openrouter-usage (Worker endpoint).
 * Matches the visual style of TavilyKeySwitcher usage cards.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Cpu } from "lucide-react";
import { API_BASE_URL } from "@/constants";

interface OpenRouterKeyUsage {
  configured: boolean;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  percentage: number;
  lastUpdated: string;
}

interface OpenRouterUsageState {
  key1: OpenRouterKeyUsage;
  key2: OpenRouterKeyUsage;
}

function deriveStatus(key: OpenRouterKeyUsage): "online" | "warning" | "error" | "offline" {
  if (!key.configured) return "offline";
  if (key.totalCredits > 0 && key.percentage < 10) return "error";
  if (key.totalCredits > 0 && key.percentage < 25) return "warning";
  return "online";
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  online:  { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Online" },
  warning: { bg: "bg-amber-50 border-amber-200",     text: "text-amber-700",   label: "Warning" },
  error:   { bg: "bg-red-50 border-red-200",          text: "text-red-700",     label: "Critical" },
  offline: { bg: "bg-slate-100 border-slate-200",     text: "text-slate-500",   label: "Offline" },
};

export function OpenRouterUsageCard() {
  const [data, setData] = useState<OpenRouterUsageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/stats/openrouter-usage`);
      if (res.ok) {
        const json = (await res.json()) as OpenRouterUsageState;
        setData(json);
        setLastFetch(new Date().toISOString());
      }
    } catch (err) {
      console.warn("Failed to fetch OpenRouter usage:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  const formatCredits = (n: number): string => {
    if (n === 0) return "0";
    if (n < 0.01) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
  };

  function renderKeyCard(title: string, usage: OpenRouterKeyUsage) {
    if (!usage.configured) {
      return (
        <div className="rounded-xl border border-dashed border-border/80 p-4 bg-muted/20 flex flex-col items-center justify-center min-h-[180px]">
          <p className="text-sm font-bold text-muted-foreground">{title}</p>
          <span className="text-xs text-muted-foreground/60 mt-1">Not Configured</span>
        </div>
      );
    }

    const status = deriveStatus(usage);
    const statusStyle = STATUS_STYLE[status];
    const isFreeUnlimited = usage.totalCredits === 0;

    return (
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-foreground">{title}</p>
          <Badge
            variant="outline"
            className={`${statusStyle.bg} ${statusStyle.text} text-[10px] font-bold`}
          >
            {statusStyle.label}
          </Badge>
        </div>

        {/* Progress Bar & Percentage */}
        {!isFreeUnlimited ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Credits Remaining</span>
              <span className="font-bold text-foreground">{usage.percentage}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  usage.percentage < 10
                    ? "bg-red-500"
                    : usage.percentage < 25
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, usage.percentage)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-bold text-emerald-600">Free Tier (Unlimited)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 w-full" />
            </div>
          </div>
        )}

        {/* Credits Grid */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center border-y border-border/40 my-1">
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Used</p>
            <p className="text-xs font-bold text-foreground mt-0.5">
              {isFreeUnlimited ? "Free" : formatCredits(usage.usedCredits)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Remaining</p>
            <p className="text-xs font-bold text-emerald-600 mt-0.5">
              {isFreeUnlimited ? "∞" : formatCredits(usage.remainingCredits)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Total</p>
            <p className="text-xs font-bold text-foreground mt-0.5">
              {isFreeUnlimited ? "∞" : formatCredits(usage.totalCredits)}
            </p>
          </div>
        </div>

        <div className="text-[9px] text-muted-foreground/60 text-right pt-1 border-t border-border/20 mt-1">
          Updated:{" "}
          {new Date(usage.lastUpdated).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Cpu className="h-5 w-5 text-violet-500" />
              OpenRouter Usage
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Live credit balance from OpenRouter&apos;s API. Supports dual-key failover.
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
        {data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderKeyCard("OpenRouter Key 1 (Primary)", data.key1)}
            {renderKeyCard("OpenRouter Key 2 (Backup)", data.key2)}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading OpenRouter usage...
          </div>
        ) : (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Could not load OpenRouter usage data.
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
