import { useCallback, useEffect, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/constants";
import { authenticatedFetch } from "@/services/authenticatedFetch";

interface GroqSnapshot {
  requestLimit: number | null;
  requestsRemaining: number | null;
  requestsReset: string | null;
  tokenLimit: number | null;
  tokensRemaining: number | null;
  tokensReset: string | null;
  capturedAt: string;
}

interface GroqUsageResponse {
  configured: boolean;
  snapshot: GroqSnapshot | null;
}

function isGroqUsageResponse(value: unknown): value is GroqUsageResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { configured?: unknown; snapshot?: unknown };
  return typeof candidate.configured === "boolean" &&
    (candidate.snapshot === null || typeof candidate.snapshot === "object");
}

function percent(remaining: number | null, limit: number | null): number | null {
  return remaining !== null && limit !== null && limit > 0
    ? Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)))
    : null;
}

function Meter({ label, remaining, limit, reset }: {
  label: string; remaining: number | null; limit: number | null; reset: string | null;
}) {
  const value = percent(remaining, limit);
  return <div className="space-y-2">
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="font-bold">{remaining?.toLocaleString() ?? "—"} / {limit?.toLocaleString() ?? "—"}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${value !== null && value < 15 ? "bg-red-500" : value !== null && value < 35 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${value ?? 0}%` }} />
    </div>
    <p className="text-right text-[10px] text-muted-foreground">{value === null ? "Waiting for Groq headers" : `${value}% remaining`}{reset ? ` · resets in ${reset}` : ""}</p>
  </div>;
}

export function GroqUsageCard() {
  const [data, setData] = useState<GroqUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/stats/groq-usage`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!isGroqUsageResponse(payload)) throw new Error("Invalid Groq usage response");
      setData(payload);
    } catch (error) {
      console.warn("Failed to fetch Groq usage:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <Card className="border-border/60 shadow-sm">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-black"><Gauge className="h-5 w-5 text-orange-500" />Groq Usage</CardTitle>
          <CardDescription className="mt-1 text-xs">Latest limits reported by Groq response headers.</CardDescription>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      {data && !data.configured && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Groq is not configured.</div>}
      {data?.configured && !data.snapshot && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Make one Groq fact-check request to load live limits.</div>}
      {data?.snapshot && <>
        <div className="flex items-center justify-between"><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Live headers</Badge><span className="text-[10px] text-muted-foreground">Updated {new Date(data.snapshot.capturedAt).toLocaleString("en-PH")}</span></div>
        <Meter label="Daily requests" remaining={data.snapshot.requestsRemaining} limit={data.snapshot.requestLimit} reset={data.snapshot.requestsReset} />
        <Meter label="Tokens this minute" remaining={data.snapshot.tokensRemaining} limit={data.snapshot.tokenLimit} reset={data.snapshot.tokensReset} />
      </>}
      {!loading && !data && <div className="py-6 text-center text-sm text-muted-foreground">Could not load Groq usage.</div>}
    </CardContent>
  </Card>;
}
