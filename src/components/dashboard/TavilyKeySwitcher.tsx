/**
 * src/components/dashboard/TavilyKeySwitcher.tsx
 *
 * Interactive Tavily Key Switcher component for the API Dashboard.
 * Allows switching between Tavily Key 1, Tavily Key 2, and Auto Failover mode.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Key, ShieldCheck, Zap, RefreshCw, Check } from "lucide-react";
import { API_BASE_URL } from "@/constants";

export type TavilyKeyOption = "auto" | "key1" | "key2";

interface TavilyConfigState {
  preferredKey: TavilyKeyOption;
  key1Configured: boolean;
  key2Configured: boolean;
}

const STORAGE_KEY = "teka_tavily_preferred_key";

export interface TavilyDetailedUsage {
  configured: boolean;
  plan: string;
  usage: number;
  limit: number;
  remaining: number;
  percentage: number;
  breakdown: {
    search: number;
    extract: number;
    crawl: number;
    map: number;
    research: number;
  };
  lastUpdated: string;
}

interface TavilyUsageState {
  key1: TavilyDetailedUsage;
  key2: TavilyDetailedUsage;
}

export function TavilyKeySwitcher() {
  const [mode, setMode] = useState<TavilyKeyOption>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved as TavilyKeyOption) || "auto";
  });
  const [loading, setLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState<TavilyConfigState>({
    preferredKey: "auto",
    key1Configured: true,
    key2Configured: true,
  });
  const [usageData, setUsageData] = useState<TavilyUsageState | null>(null);

  // Fetch initial config status and detailed usage from Worker
  useEffect(() => {
    let isMounted = true;
    async function fetchConfigAndUsage() {
      try {
        const configRes = await fetch(`${API_BASE_URL}/stats/tavily-config`);
        if (configRes.ok && isMounted) {
          const data = (await configRes.json()) as TavilyConfigState;
          setConfigStatus(data);
          if (data.preferredKey) setMode(data.preferredKey);
        }

        const usageRes = await fetch(`${API_BASE_URL}/stats/tavily-usage`);
        if (usageRes.ok && isMounted) {
          const data = (await usageRes.json()) as TavilyUsageState;
          setUsageData(data);
        }
      } catch (err) {
        console.warn("Failed to load Tavily usage status:", err);
      }
    }
    void fetchConfigAndUsage();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSwitch(selectedMode: TavilyKeyOption) {
    setMode(selectedMode);
    localStorage.setItem(STORAGE_KEY, selectedMode);
    setLoading(true);

    try {
      await fetch(`${API_BASE_URL}/stats/tavily-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredKey: selectedMode }),
      });
    } catch (err) {
      console.warn("Failed to sync Tavily preference to backend:", err);
    } finally {
      setLoading(false);
    }
  }

  function renderUsageCard(title: string, usage: TavilyDetailedUsage) {
    if (!usage.configured) {
      return (
        <div className="rounded-xl border border-dashed border-border/80 p-4 bg-muted/20 flex flex-col items-center justify-center min-h-[220px]">
          <p className="text-sm font-bold text-muted-foreground">{title}</p>
          <span className="text-xs text-muted-foreground/60 mt-1">Not Configured</span>
        </div>
      );
    }

    const formatNum = (n: number) => n.toLocaleString();

    return (
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-foreground">{title}</p>
          <Badge variant="outline" className="bg-primary/5 text-primary text-[10px] font-bold border-primary/20">
            Plan: {usage.plan}
          </Badge>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Usage</span>
            <span className="font-bold text-foreground">{usage.percentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usage.percentage > 85
                  ? "bg-red-500"
                  : usage.percentage > 60
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, usage.percentage)}%` }}
            />
          </div>
        </div>

        {/* Credits Status */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center border-y border-border/40 my-1">
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Used</p>
            <p className="text-xs font-bold text-foreground mt-0.5">{formatNum(usage.usage)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Remaining</p>
            <p className="text-xs font-bold text-emerald-600 mt-0.5">{formatNum(usage.remaining)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Total Limit</p>
            <p className="text-xs font-bold text-foreground mt-0.5">{formatNum(usage.limit)}</p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-2">Endpoint Breakdown</p>
          {[
            { label: "Search", value: usage.breakdown.search },
            { label: "Extract", value: usage.breakdown.extract },
            { label: "Crawl", value: usage.breakdown.crawl },
            { label: "Map", value: usage.breakdown.map },
            { label: "Research", value: usage.breakdown.research },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{formatNum(item.value)}</span>
            </div>
          ))}
        </div>

        <div className="text-[9px] text-muted-foreground/60 text-right pt-2 border-t border-border/20 mt-1">
          Updated: {new Date(usage.lastUpdated).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
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
              <Key className="h-5 w-5 text-primary" />
              Tavily Key Switcher
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Select which Tavily search API key to active for fact-checking searches.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                configStatus.key1Configured
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-500"
              }
            >
              Key 1: {configStatus.key1Configured ? "Active" : "Not Set"}
            </Badge>
            <Badge
              variant="outline"
              className={
                configStatus.key2Configured
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }
            >
              Key 2: {configStatus.key2Configured ? "Active (Backup)" : "Not Set"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Auto Failover Mode */}
          <button
            type="button"
            onClick={() => void handleSwitch("auto")}
            disabled={loading}
            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all relative ${
              mode === "auto"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-border/80 bg-background hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <div className="flex items-center gap-1.5 font-bold text-sm">
                <Zap className="h-4 w-4 text-amber-500" />
                Auto Failover
              </div>
              {mode === "auto" && (
                <span className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-xs">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Uses Key 1 first; automatically fails over to Key 2 if Key 1 hits quota or rate limits.
            </p>
            <Badge variant="secondary" className="mt-2 text-[10px] font-bold">
              Recommended
            </Badge>
          </button>

          {/* Force Key 1 */}
          <button
            type="button"
            onClick={() => void handleSwitch("key1")}
            disabled={loading}
            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all relative ${
              mode === "key1"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-border/80 bg-background hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <div className="flex items-center gap-1.5 font-bold text-sm">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Force Tavily Key 1
              </div>
              {mode === "key1" && (
                <span className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-xs">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Strictly uses primary <code className="rounded bg-muted px-1 py-0.5 text-[10px]">TAVILY_API_KEY</code> for all web searches.
            </p>
            <span className="mt-2 text-[10px] font-medium text-muted-foreground">
              Primary Key Only
            </span>
          </button>

          {/* Force Key 2 */}
          <button
            type="button"
            onClick={() => void handleSwitch("key2")}
            disabled={loading}
            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all relative ${
              mode === "key2"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-border/80 bg-background hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <div className="flex items-center gap-1.5 font-bold text-sm">
                <RefreshCw className="h-4 w-4 text-blue-600" />
                Force Tavily Key 2
              </div>
              {mode === "key2" && (
                <span className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-xs">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Strictly uses secondary <code className="rounded bg-muted px-1 py-0.5 text-[10px]">TAVILY_API_KEY_2</code> for all web searches.
            </p>
            <span className="mt-2 text-[10px] font-medium text-muted-foreground">
              Backup Key Only
            </span>
          </button>
        </div>

        {/* Live Usage Details Section */}
        {usageData && (
          <div className="border-t border-border/40 pt-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
              Live Key Usage Statistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderUsageCard("Tavily Key 1 (Primary)", usageData.key1)}
              {renderUsageCard("Tavily Key 2 (Backup)", usageData.key2)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

