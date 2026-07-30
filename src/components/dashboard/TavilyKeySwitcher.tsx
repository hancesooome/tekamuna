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

  // Fetch initial config status from Worker
  useEffect(() => {
    let isMounted = true;
    async function fetchConfig() {
      try {
        const res = await fetch(`${API_BASE_URL}/stats/tavily-config`);
        if (res.ok) {
          const data = (await res.json()) as TavilyConfigState;
          if (isMounted) {
            setConfigStatus(data);
            if (data.preferredKey) setMode(data.preferredKey);
          }
        }
      } catch {
        // Fallback gracefully
      }
    }
    void fetchConfig();
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
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
