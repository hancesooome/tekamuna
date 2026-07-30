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

export function AdminSettingsPanel() {
  const [tavilyMode, setTavilyMode] = useState<TavilyModeOption>("auto");
  const [aiProviderMode, setAiProviderMode] = useState<AiProviderModeOption>("auto");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
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
    async function loadSettings() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/settings`);
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        
        if (isMounted && data) {
          if (data.settings?.tavilyMode) setTavilyMode(data.settings.tavilyMode);
          if (data.settings?.aiProviderMode) setAiProviderMode(data.settings.aiProviderMode);
          if (data.keyStatus) setKeyStatus(data.keyStatus);
        }
      } catch (err) {
        console.error("Failed to load admin settings:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void loadSettings();
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
      <Card className="border-gray-800 bg-[#0c0d0e]/60 backdrop-blur-md">
        <CardContent className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-800 bg-[#0c0d0e]/60 backdrop-blur-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-emerald-500" />
          <CardTitle className="text-gray-100">Pipeline Config Panel</CardTitle>
        </div>
        <CardDescription className="text-gray-400">
          Control Tavily search key failovers and forced AI providers. Saved settings affect the backend dynamically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Tavily Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Key className="h-4 w-4 text-emerald-500" />
              Tavily Search Key Routing
            </span>
            {isTavilyWarning && (
              <Badge variant="destructive" className="animate-pulse">Key Not Configured</Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "auto", label: "Auto Failover", desc: "Try Key 1, then Key 2" },
              { id: "force_key1", label: "Force Key 1", desc: "Only Key 1 (no fallback)" },
              { id: "force_key2", label: "Force Key 2", desc: "Only Key 2 (no fallback)" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTavilyMode(opt.id as TavilyModeOption)}
                className={`relative flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                  tavilyMode === opt.id
                    ? "border-emerald-500 bg-emerald-950/20 text-emerald-400 font-medium"
                    : "border-gray-800 bg-gray-900/40 hover:bg-gray-900/80 text-gray-400"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm">{opt.label}</span>
                  {tavilyMode === opt.id && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
                <span className="text-[10px] text-gray-500 leading-tight">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI Provider Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              AI Model Provider Routing
            </span>
            {isAiWarning && (
              <Badge variant="destructive" className="animate-pulse">Key Not Configured</Badge>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: "auto", label: "Auto Fallback", desc: "OR 1 → OR 2 → Gemini" },
              { id: "force_openrouter_key1", label: "Force OR 1", desc: "Use OpenRouter Key 1" },
              { id: "force_openrouter_key2", label: "Force OR 2", desc: "Use OpenRouter Key 2" },
              { id: "force_gemini", label: "Force Gemini", desc: "Use Gemini direct" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setAiProviderMode(opt.id as AiProviderModeOption)}
                className={`relative flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                  aiProviderMode === opt.id
                    ? "border-emerald-500 bg-emerald-950/20 text-emerald-400 font-medium"
                    : "border-gray-800 bg-gray-900/40 hover:bg-gray-900/80 text-gray-400"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs">{opt.label}</span>
                  {aiProviderMode === opt.id && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
                <span className="text-[9px] text-gray-500 leading-tight mt-1">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs leading-normal border ${
              statusMessage.type === "success"
                ? "bg-emerald-950/20 border-emerald-900 text-emerald-400"
                : "bg-red-950/20 border-red-900 text-red-400"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {(isTavilyWarning || isAiWarning) && (
          <div className="p-3 rounded-lg text-xs leading-normal border bg-amber-950/20 border-amber-900 text-amber-400">
            <strong>Warning:</strong> You have forced a provider that has no configured API key. Verify requests will immediately fail before running the pipeline until you configure the secret or switch back.
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-gray-100 font-semibold text-sm transition-all shadow-md"
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
