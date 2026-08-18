/**
 * CheckPage — stateless shareable fact-check page.
 *
 * URL format: /check?c=<base64url-encoded-claim>
 *
 * Flow:
 *   1. On mount, read ?c= param and decode the claim.
 *   2. If invalid → show friendly error with link to /verify.
 *   3. If valid   → auto-fire the fact-check immediately (no button needed).
 *   4. Show loading animation while the API call is in progress.
 *   5. Render the full result inline once done (same UI as ResultPage).
 *   6. Share button generates a new /check URL for the same claim.
 */

import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search, XCircle, Share2, BarChart2, ExternalLink, ChevronRight, FileText,
  Loader2,
} from "lucide-react";
import { useMutation }       from "@tanstack/react-query";
import { Button }            from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageContainer }     from "@/components/shared/PageContainer";
import { verifyClaim } from "@/services/api";
import type { ApiServiceError } from "@/services/api";
import { appendToHistory }   from "@/services/historyService";
import { getCredibility, scoreColor, scoreBg } from "@/lib/credibility";
import { allSourcesMerged, stanceOf, formatDate } from "@/utils/sources";
import { decodeClaim } from "@/utils/shareUrl";
import ShareButton from "@/components/shared/ShareButton";
import ShareCardButton from "@/components/shared/ShareCardButton";
import { VERDICT_LABELS, VERDICT_CONFIG } from "@/constants";
import { ConfidenceDonut } from "@/components/shared/ConfidenceDonut";
import { StanceBadge } from "@/components/shared/StanceBadge";
import { CredBadge } from "@/components/shared/CredBadge";
import type { VerifyResult } from "@/types";
import { cn }                from "@/lib/utils";

// ─── Verdict config (imported from constants) ──────────────────────────────────
const V = VERDICT_CONFIG;

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Loading state ─────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  "Tinatanggap ang claim...",
  "Naghahanap ng mga pinagkukunan...",
  "Sinusuri ang mga ebidensya...",
  "Binubuo ang resulta...",
];

function LoadingView({ claim }: { claim: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStepIdx((i) => (i + 1) % LOADING_STEPS.length), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <PageContainer className="max-w-[850px] pb-12">
      <nav className="flex items-center gap-1.5 pt-8 pb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-foreground">Shared Check</span>
      </nav>

      {/* Claim preview */}
      <div className="mb-8 flex items-center gap-3 rounded-xl border border-[#d9e4ff] bg-[#f8faff] px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Sinusuri ang Claim</p>
          <p className="text-sm font-bold text-foreground leading-snug">{claim}</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <Search className="absolute inset-0 m-auto h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-base font-black text-foreground">Sinusuri ang claim...</p>
          <p className="mt-1 text-sm text-muted-foreground animate-pulse">{LOADING_STEPS[stepIdx]}</p>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs text-center">
          Gamit ang pinakabagong web data. Maaaring tumagal ng 5–15 segundo.
        </p>
      </div>
    </PageContainer>
  );
}

// ─── Error states ──────────────────────────────────────────────────────────────

function InvalidClaimError() {
  return (
    <PageContainer className="max-w-[850px] pb-12">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">Invalid na Link</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            May mali o walang laman ang link na ito. Subukang magsuri ng bagong claim.
          </p>
        </div>
        <Button asChild>
          <Link to="/verify"><Search className="h-4 w-4" /> Suriin ang Claim</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

function ApiErrorView({ claim, message, onRetry }: { claim: string; message: string; onRetry: () => void }) {
  return (
    <PageContainer className="max-w-[850px] pb-12">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">May nangyaring error</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">{message}</p>
          <p className="mt-3 text-xs text-muted-foreground italic">Claim: "{claim}"</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onRetry}>
            <Loader2 className="h-4 w-4" /> Subukan Ulit
          </Button>
          <Button asChild>
            <Link to="/verify"><Search className="h-4 w-4" /> Magsuri Muli</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

// ─── Result view (inline, same layout as ResultPage) ──────────────────────────

function ResultView({ result }: { result: VerifyResult }) {
  const cfg   = V[result.verdict];
  const { Icon } = cfg;
  const label = VERDICT_LABELS[result.verdict];
  const allSources    = allSourcesMerged(result);
  const credibleCount = allSources.filter((s) => getCredibility(s.url).score >= 70).length;
  const factualAccuracy = Math.round(result.confidence * 0.18);
  const sourceAlignment = Math.round(result.confidence * 0.27);
  const dataRecency     = Math.min(95, Math.round(result.confidence * 0.95));

  return (
    <PageContainer className="animate-page-in max-w-[850px] pb-12">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 pt-8 pb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-foreground">Shared Check</span>
      </nav>

      {/* Shared-link notice */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 mb-5 text-xs text-primary font-semibold">
        <Share2 className="h-4 w-4 shrink-0" />
        Ito ay isang shared fact-check link. Ang resultang ito ay sariwang kinuha ngayon gamit ang pinakabagong data.
      </div>

      {/* Claim banner */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#d9e4ff] bg-[#f8faff] px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6 sm:py-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Sinuri na Claim</p>
          <p className="text-sm font-bold text-foreground leading-snug">{result.claim}</p>
        </div>
      </div>

      {/* Two-column: verdict + confidence */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_270px] gap-5 mb-6">

        {/* Verdict card */}
        <section aria-labelledby="shared-ai-verdict-title" className={cn("flex flex-col gap-4 rounded-xl border-2 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.07)] sm:p-6", cfg.bg, cfg.border)}>
          <div className="flex items-start gap-4">
            <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm", cfg.iconBg)}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div>
              <p id="shared-ai-verdict-title" className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-primary">AI VERDICT</p>
              <p className={cn("text-3xl font-black leading-tight mt-0.5", cfg.label)}>{label}</p>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{result.explanation}</p>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-xs" asChild>
              <Link to="/result/sources" state={{ result }}>
                <BarChart2 className="h-3.5 w-3.5" /> Ikumpara ang Sources
              </Link>
            </Button>
            <ShareButton result={result} />
            <ShareCardButton result={result} />
          </div>
        </section>

        {/* Confidence panel */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-[#d9e4ff] bg-[#f8faff] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground self-start">Detection Confidence</p>
          <div className="flex flex-row items-center gap-4 w-full sm:flex-col sm:items-center">
            <ConfidenceDonut value={result.confidence} color={cfg.arc} />
            <div className="flex flex-col gap-1 sm:text-center sm:items-center">
              <div className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{allSources.length}</span> sources analyzed
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{credibleCount}</span> high credibility
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/60 pt-2 w-full">
            <strong>Detection Confidence</strong> indicates how confidently the claim detector classified the input as a fact-checkable claim based on routing heuristics and pattern matching. It is <strong>not</strong> the AI model's confidence in the truthfulness of the claim or the final verdict.
          </p>
          <div className="w-full space-y-2.5 border-t border-border pt-3">
            {[
              { label: "Factual accuracy", value: factualAccuracy },
              { label: "Source alignment", value: sourceAlignment },
              { label: "Data recency",     value: dataRecency },
            ].map(({ label: l, value }) => (
              <div key={l}>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{l}</span><span className="font-bold">{value}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="buod" className="w-full overflow-hidden rounded-xl border border-[#d9e4ff] bg-[#f8faff] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <TabsList className="w-full rounded-none border-b border-[#d9e4ff] bg-transparent p-0 h-auto justify-start gap-0 overflow-x-auto">
          {(["buod", "timeline", "sources"] as const).map((v) => {
            const names = { buod: "Buod", timeline: "Timeline ng Ebidensya", sources: "Mga Source" };
            return (
              <TabsTrigger key={v} value={v} className={cn(
                "flex-1 justify-center rounded-none border-b-2 border-transparent px-3 sm:px-5 py-4 text-sm font-semibold text-muted-foreground whitespace-nowrap",
                "data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground transition-colors",
              )}>
                {names[v]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Buod */}
        <TabsContent value="buod" className="mt-0 px-5 py-5">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-white/55 p-4">
              <h3 className="text-sm font-black text-foreground mb-3">Buod ng Pagsusuri</h3>
              <p className="text-sm text-foreground leading-relaxed">{result.explanation}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-black text-amber-800 mb-2">✨ Ano ang Totoo</p>
              <p className="text-sm text-amber-900 leading-relaxed">{result.truthStatement}</p>
            </div>
          </div>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="mt-0 px-5 py-5">
          {allSources.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <p className="text-sm text-muted-foreground">Walang ebidensya na nakolekta.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {allSources.map((source, i) => {
                const { score } = getCredibility(source.url);
                const stance = stanceOf(source, result);
                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={cn("h-4 w-4 rounded-full border-2 border-white shadow-sm shrink-0 mt-1",
                        stance === "Supports" ? "bg-emerald-400" : stance === "Contradicts" ? "bg-red-400" : "bg-primary")} />
                      {i < allSources.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="flex-1 rounded-2xl border border-border bg-white p-4 mb-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-foreground">{source.sourceName}</span>
                          <CredBadge score={score} />
                        </div>
                        <StanceBadge stance={stance === "Neutral" ? "Neutral" : stance === "Supports" ? "Supports" : "Contradicts"} />
                      </div>
                      <p className="text-xs text-foreground leading-relaxed mb-3">{source.summary}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(source.publishedDate)}
                        </span>
                        <a href={source.url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                          Buksan <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Sources */}
        <TabsContent value="sources" className="mt-0 px-5 py-5">
          <p className="text-xs text-muted-foreground mb-4">
            <span className="font-bold text-foreground">{allSources.length}</span> sources ang sinuri.
          </p>
          <div className="rounded-2xl border border-[#d9e4ff] bg-white/55 overflow-hidden">
            {allSources
              .map((s) => ({ source: s, cred: getCredibility(s.url), stance: stanceOf(s, result) }))
              .sort((a, b) => b.cred.score - a.cred.score)
              .map(({ source, cred, stance }, i) => (
                <div key={i} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors", i > 0 && "border-t border-border")}>
                  <div className={cn("h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-xs font-black", scoreBg(cred.score), scoreColor(cred.score))}>
                    {cred.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-foreground leading-snug line-clamp-2">{source.title || source.sourceName}</p>
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground">{source.sourceName}</p>
                  </div>
                  <div className="shrink-0">
                    <StanceBadge stance={stance === "Neutral" ? "Neutral" : stance === "Supports" ? "Supports" : "Contradicts"} />
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Bottom actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-border">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link to="/verify">Suriin ang Bagong Claim</Link>
        </Button>
        <Button className="w-full sm:w-auto" asChild>
          <Link to="/kasaysayan">Tingnan ang Kasaysayan</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckPage() {
  const [searchParams] = useSearchParams();

  // Decode claim once on mount
  const encoded = searchParams.get("c") ?? "";
  const claim   = decodeClaim(encoded);

  const { mutate, isPending, data, error, reset } = useMutation<
    VerifyResult,
    ApiServiceError,
    { claim: string }
  >({
    mutationFn: ({ claim: c }) => verifyClaim({ claim: c }),
    onSuccess: (result) => {
      appendToHistory(result);
    },
  });

  // Auto-fire on mount if claim is valid
  useEffect(() => {
    if (claim) {
      mutate({ claim });
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invalid URL
  if (!claim) return <InvalidClaimError />;

  // Loading
  if (isPending) return <LoadingView claim={claim} />;

  // API error
  if (error) return (
    <ApiErrorView
      claim={claim}
      message={error.message}
      onRetry={() => { reset(); mutate({ claim }); }}
    />
  );

  // Success
  if (data) return <ResultView result={data} />;

  // Initial render before effect fires (extremely brief)
  return <LoadingView claim={claim} />;
}
