/**
 * src/components/dashboard/AdminSettingsPanel.tsx
 *
 * Persisted pipeline settings dashboard panel.
 * Controls both Tavily search key routing and AI provider model routing.
 * Settings are stored in Supabase and read dynamically by the Cloudflare Worker.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Zap, RefreshCw, Check, Key, Settings } from "lucide-react";
import { API_BASE_URL } from "@/constants";
import { supabase } from "@/lib/supabase";

export type TavilyModeOption = "auto" | "force_key1" | "force_key2";
export type AiProviderModeOption = "auto" | "force_openrouter_key1" | "force_openrouter_key2" | "force_gemini";

interface KeyConfigStatus {
  tavilyKey1: boolean;
  tavilyKey2: boolean;
  openrouterKey1: boolean;
  openrouterKey2: boolean;
  gemini: boolean;
}

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

export function AdminSettingsPanel() {
  const [tavilyMode, setTavilyMode] = useState<TavilyModeOption>("auto");
  const [aiProviderMode, setAiProviderMode] = useState<AiProviderModeOption>("auto");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [usageData, setUsageData] = useState<TavilyUsageState | null>(null);
  
  const [keyStatus, setKeyStatus] = useState<KeyConfigStatus>({
    tavilyKey1: false,
    tavilyKey2: false,
    openrouterKey1: false,
    openrouterKey2: false,
    gemini: false,
  });

  // Fetch persisted settings from the Worker API
  useEffect(() => {
    let isMounted = true;
    async function loadSettingsAndUsage() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/settings`);
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        
        if (isMounted && data) {
          if (data.settings?.tavilyMode) setTavilyMode(data.settings.tavilyMode);
          if (data.settings?.aiProviderMode) setAiProviderMode(data.settings.aiProviderMode);
          if (data.keyStatus) setKeyStatus(data.keyStatus);
        }

        const usageRes = await fetch(`${API_BASE_URL}/stats/tavily-usage`);
        if (usageRes.ok && isMounted) {
          const usage = (await usageRes.json()) as TavilyUsageState;
          setUsageData(usage);
        }
      } catch (err) {
        console.error("Failed to load admin settings:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void loadSettingsAndUsage();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setStatusMessage(null);

    try {
      // Get the current Supabase session JWT token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Unauthorized — no active admin session.");
      }

      const res = await fetch(`${API_BASE_URL}/admin/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tavilyMode,
          aiProviderMode,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to update configuration");
      }

      setStatusMessage({ text: "Settings saved and cache invalidated successfully!", type: "success" });
    } catch (err: any) {
      console.error("Failed to save configuration:", err);
      setStatusMessage({ text: err.message || "Failed to save configuration.", type: "error" });
    } finally {
      setSaving(false);
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

  // Safety checks: Warn if the user forces a key that isn't configured in wrangler secrets
  const isTavilyWarning = 
    (tavilyMode === "force_key1" && !keyStatus.tavilyKey1) ||
    (tavilyMode === "force_key2" && !keyStatus.tavilyKey2);

  const isAiWarning =
    (aiProviderMode === "force_openrouter_key1" && !keyStatus.openrouterKey1) ||
    (aiProviderMode === "force_openrouter_key2" && !keyStatus.openrouterKey2) ||
    (aiProviderMode === "force_gemini" && !keyStatus.gemini);

  if (loading) {
    return (
      <Card className="border-border/60 bg-card shadow-sm">
        <CardContent className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-emerald-500" />
          <CardTitle className="text-lg font-black flex items-center gap-2">Pipeline Settings</CardTitle>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Control Tavily search key failovers and forced AI providers. Saved settings affect the backend dynamically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Tavily Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Tavily Search Key Routing
            </span>
            {isTavilyWarning && (
              <Badge variant="destructive" className="animate-pulse">Key Not Configured</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: "auto", label: "Auto Failover", desc: "Try Key 1, then Key 2" },
              { id: "force_key1", label: "Force Key 1", desc: "Only Key 1 (no fallback)" },
              { id: "force_key2", label: "Force Key 2", desc: "Only Key 2 (no fallback)" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTavilyMode(opt.id as TavilyModeOption)}
                className={`relative flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all ${
                  tavilyMode === opt.id
                    ? "border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary/20"
                    : "border-border bg-background hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-bold text-foreground">{opt.label}</span>
                  {tavilyMode === opt.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <span className="text-xs text-muted-foreground leading-normal">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI Provider Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              AI Model Provider Routing
            </span>
            {isAiWarning && (
              <Badge variant="destructive" className="animate-pulse">Key Not Configured</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { id: "auto", label: "Auto Fallback", desc: "OR 1 → OR 2 → Gemini" },
              { id: "force_openrouter_key1", label: "Force OR 1", desc: "Use OpenRouter Key 1" },
              { id: "force_openrouter_key2", label: "Force OR 2", desc: "Use OpenRouter Key 2" },
              { id: "force_gemini", label: "Force Gemini", desc: "Use Gemini direct" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setAiProviderMode(opt.id as AiProviderModeOption)}
                className={`relative flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all ${
                  aiProviderMode === opt.id
                    ? "border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary/20"
                    : "border-border bg-background hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-bold text-foreground">{opt.label}</span>
                  {aiProviderMode === opt.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <span className="text-xs text-muted-foreground leading-normal">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Usage Details Section */}
        {usageData && (
          <div className="border-t border-border/40 pt-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Live Key Usage Statistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderUsageCard("Tavily Key 1 (Primary)", usageData.key1)}
              {renderUsageCard("Tavily Key 2 (Backup)", usageData.key2)}
            </div>
          </div>
        )}

        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl text-sm leading-normal border ${
              statusMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400"
                : "bg-destructive/5 border-destructive/20 text-destructive"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {(isTavilyWarning || isAiWarning) && (
          <div className="p-4 rounded-xl text-sm leading-normal border bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400">
            <strong>Warning:</strong> You have forced a provider that has no configured API key. Verify requests will immediately fail before running the pipeline until you configure the secret or switch back.
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/95 active:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold text-sm transition-all shadow-sm"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" /> Save Pipeline Settings
              </>
            )}
          </button>
        </div>

      </CardContent>
    </Card>
  );
}
