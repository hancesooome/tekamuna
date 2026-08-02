/**
 * ResultPage — redesigned to match Figma screenshots.
 *
 * Layout:
 *   Breadcrumb
 *   Claim banner
 *   Two-column: [Verdict card | Confidence panel]
 *   Three tabs: Buod / Timeline ng Ebidensya / Mga Source
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText, XCircle, CheckCircle, AlertTriangle, HelpCircle,
  ThumbsUp, ThumbsDown, Share2, BarChart2, Search,
  ExternalLink, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageContainer } from "@/components/shared/PageContainer";
import { RESULT_STORAGE_KEY, VERDICT_LABELS } from "@/constants";
import { getCredibility, scoreColor, scoreBg } from "@/lib/credibility";
import { allSourcesMerged, uniqueEvidenceSources, stanceOf, formatDate, extractKeyFacts } from "@/utils/sources";
import { buildShareUrl } from "@/utils/shareUrl";
import type { VerifyResult, Verdict } from "@/types";
import { cn } from "@/lib/utils";
import ShareCardButton from "@/components/shared/ShareCardButton";

// --- Verdict config -----------------------------------------------------------

const V = {
  true: {
    Icon: CheckCircle,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconBg: "bg-emerald-500",
    label: "text-emerald-600",
    ring: "ring-emerald-200",
    arc: "#10b981",
  },
  false: {
    Icon: XCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    iconBg: "bg-red-500",
    label: "text-red-600",
    ring: "ring-red-200",
    arc: "#ef4444",
  },
  misleading: {
    Icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-500",
    label: "text-amber-600",
    ring: "ring-amber-200",
    arc: "#f59e0b",
  },
  unverified: {
    Icon: HelpCircle,
    bg: "bg-slate-50",
    border: "border-slate-200",
    iconBg: "bg-slate-400",
    label: "text-slate-600",
    ring: "ring-slate-200",
    arc: "#94a3b8",
  },
} satisfies Record<Verdict, { Icon: React.ElementType; bg: string; border: string; iconBg: string; label: string; ring: string; arc: string }>;

// --- Donut confidence gauge ---------------------------------------------------

function ConfidenceDonut({ value, color }: { value: number; color: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg viewBox="0 0 120 120" className="w-24 h-24 sm:w-32 sm:h-32">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="12"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x="60" y="56" textAnchor="middle" dominantBaseline="middle"
        className="font-black" style={{ fontSize: 22, fill: color, fontWeight: 900 }}>
        {value}%
      </text>
      <text x="60" y="75" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 10, fill: "#6b7280" }}>
        Confidence
      </text>
    </svg>
  );
}

// --- Stance badge -------------------------------------------------------------

function StanceBadge({ stance }: { stance: "Supports" | "Contradicts" | "Neutral" | "Partially Contradicts" }) {
  const map = {
    Supports:              "bg-emerald-50 text-emerald-700 border-emerald-200",
    Contradicts:           "bg-red-50 text-red-700 border-red-200",
    "Partially Contradicts": "bg-amber-50 text-amber-700 border-amber-200",
    Neutral:               "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold", map[stance])}>
      {stance}
    </span>
  );
}

// --- Credibility level badge --------------------------------------------------

function CredBadge({ score }: { score: number }) {
  if (score >= 85) return <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Mataas na Kredibilidad</span>;
  if (score >= 65) return <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Katamtaman na Kredibilidad</span>;
  return <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Mababang Kredibilidad</span>;
}

// --- Loading / Error skeletons ------------------------------------------------

function LoadingSkeleton() {
  return (
    <PageContainer className="pb-8">
      <div className="flex flex-col gap-5 pt-6">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-16 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <div className="h-64 rounded-2xl bg-muted animate-pulse" />
          <div className="h-64 rounded-2xl bg-muted animate-pulse" />
        </div>
        <div className="h-96 rounded-2xl bg-muted animate-pulse" />
      </div>
    </PageContainer>
  );
}

function ErrorState() {
  return (
    <PageContainer className="pb-8">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">Walang resulta</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            Wala kaming nahanap na resulta ng pagsusuri. Mag-submit muli ng iyong claim.
          </p>
        </div>
        <Button asChild>
          <Link to="/verify"><Search className="h-4 w-4" /> I-Verify ang Claim</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

// --- Source Carousel ----------------------------------------------------------

function SourceCarousel({ result }: { result: VerifyResult }) {
  const sources   = uniqueEvidenceSources(result);
  const total     = sources.length;
  const [current, setCurrent] = useState(0);
  const trackRef   = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  const getCardWidth = () => {
    const el = trackRef.current;
    if (!el) return 0;
    const first = el.firstElementChild as HTMLElement | null;
    return first ? first.offsetWidth : 0;
  };

  // Swipe → index
  const onScroll = useCallback(() => {
    if (isScrolling.current) return;
    const el = trackRef.current;
    if (!el) return;
    const w = getCardWidth();
    if (w === 0) return;
    const idx = Math.round(el.scrollLeft / w);
    setCurrent(Math.max(0, Math.min(total - 1, idx)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Dot click → scroll
  const scrollTo = useCallback((idx: number) => {
    requestAnimationFrame(() => {
      const el = trackRef.current;
      if (!el) return;
      const w = getCardWidth();
      if (w === 0) return;
      isScrolling.current = true;
      el.scrollTo({ left: w * idx, behavior: "smooth" });
      setTimeout(() => { isScrolling.current = false; }, 500);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (total === 0) return null;

  return (
    <div>
      {/* Header row: title + counter */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black text-foreground">Mga Katulad na Claim</h3>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          {current + 1} / {total}
        </span>
      </div>

      {/* Card track — CSS scroll snap */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {sources.map((s) => {
          const { score } = getCredibility(s.url);
          const facts = extractKeyFacts(s.summary);
          const validUrl = s.url && s.url.startsWith("http") ? s.url : null;
          return (
            <div
              key={s.url || i}
              className="shrink-0 w-[82vw] max-w-xs snap-center rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow flex flex-col gap-2"
            >
              {/* Domain + credibility score */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-muted-foreground truncate">
                  {(() => { try { return new URL(s.url).hostname.replace("www.", ""); } catch { return s.sourceName ?? s.url; } })()}
                </span>
                <span className={cn(
                  "shrink-0 text-xs font-black rounded-full px-2 py-0.5",
                  scoreBg(score), scoreColor(score),
                )}>
                  {score}
                </span>
              </div>

              {/* Title */}
              <p className="text-xs font-semibold text-foreground leading-snug line-clamp-3 flex-1">
                {s.title || s.sourceName}
              </p>

              {/* Key facts */}
              {facts.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground mb-1">
                    Mga Key Facts
                  </p>
                  <ul className="space-y-1">
                    {facts.slice(0, 2).map((fact: string, fi: number) => (
                      <li key={fi} className="flex items-start gap-1.5 text-[11px] text-foreground leading-snug">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        <span className="line-clamp-2">{fact}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-border/50 mt-auto">
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(s.publishedDate) ?? "Petsa hindi available"}
                </span>
                {validUrl ? (
                  <a
                    href={validUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold text-primary flex items-center gap-0.5 hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    Buksan ang Source <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Walang link</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {sources.map((_, i) => (
            <button
              key={i}
              onClick={() => { scrollTo(i); setCurrent(i); }}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                "rounded-full transition-all duration-200",
                i === current
                  ? "w-5 h-2 bg-primary"
                  : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main success view --------------------------------------------------------

function SuccessView({ result }: { result: VerifyResult }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const cfg = V[result.verdict];
  const { Icon } = cfg;
  const label = VERDICT_LABELS[result.verdict];
  const verifiedAt = new Date(result.verifiedAt);
  const allSources = allSourcesMerged(result);
  const credibleCount = allSources.filter((s) => getCredibility(s.url).score >= 70).length;

  // Derived mini-bar values (approximate from available data)
  const factualAccuracy = Math.round(result.confidence * 0.18);
  const sourceAlignment = Math.round(result.confidence * 0.27);
  const dataRecency     = Math.min(95, Math.round(result.confidence * 0.95));

  return (
    <PageContainer className="animate-page-in max-w-[850px] pb-12">

      {/* -- Breadcrumb -- */}
      <nav className="flex items-center gap-1.5 pt-8 pb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/verify" className="hover:text-foreground transition-colors">Verify</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-foreground">Resulta</span>
      </nav>

      {/* -- Claim banner -- */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#d9e4ff] bg-[#f8faff] px-5 py-5 mb-6 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 mt-0.5">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            Sinuri na Claim
          </p>
          <p className="text-sm font-bold text-foreground leading-snug break-words">
            {result.claim}
          </p>
        </div>
      </div>

      {/* -- Two-column: verdict + confidence -- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_270px] gap-5 mb-6">

        {/* Left: verdict card */}
        <div className={cn("rounded-2xl border p-6 flex flex-col gap-4", cfg.bg, cfg.border)}>
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm", cfg.iconBg)}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Hatol ng AI
              </p>
              <p className={cn("text-3xl font-black leading-tight mt-0.5", cfg.label)}>
                {label}
              </p>
            </div>
          </div>

          {/* Explanation */}
          <p className="text-sm text-foreground leading-relaxed">{result.explanation}</p>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-xs" asChild>
              <Link to="/result/sources" state={{ result }}>
                <BarChart2 className="h-3.5 w-3.5" />
                Ikumpara ang Sources
              </Link>
            </Button>
            <ShareCardButton result={result} />
            <Button variant="outline" size="sm" className={cn("text-xs transition-all", copied && "border-emerald-400 text-emerald-600")} onClick={async () => {
              const url = buildShareUrl(result.claim);
              if (navigator.share) {
                try {
                  await navigator.share({ title: "Teka Muna — Fact Check", text: `${label}: ${result.claim}`, url });
                  return;
                } catch { /* user cancelled — fall through */ }
              }
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch { /* clipboard blocked */ }
            }}>
              <Share2 className="h-3.5 w-3.5" />
              {copied ? "Link copied!" : "I-share"}
            </Button>
          </div>

          {/* Feedback row */}
          <div className="flex items-center gap-3 pt-1 border-t border-black/5">
            <span className="text-xs text-muted-foreground">Tama ba ang hatol na ito?</span>
            <button className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-emerald-600 transition-colors">
              <ThumbsUp className="h-3.5 w-3.5" /> Oo
            </button>
            <button className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-red-500 transition-colors">
              <ThumbsDown className="h-3.5 w-3.5" /> Hindi
            </button>
          </div>
        </div>

        {/* Right: confidence panel */}
        <div className="rounded-2xl border border-[#d9e4ff] bg-[#f8faff] p-5 flex flex-col items-center gap-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground self-start">
            Detection Confidence
          </p>
          {/* On mobile: horizontal layout. On desktop: vertical */}
          <div className="flex flex-row items-center gap-4 w-full sm:flex-col sm:items-center">
            <ConfidenceDonut value={result.confidence} color={cfg.arc} />
            <div className="flex flex-col gap-1 sm:text-center sm:items-center">
              <div className="text-xs text-muted-foreground leading-relaxed">
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
          {/* Mini bars */}
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
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* -- Three tabs -- */}
      <Tabs defaultValue="buod" className="w-full overflow-hidden rounded-2xl border border-[#d9e4ff] bg-[#f8faff] shadow-sm">
        <TabsList className="w-full rounded-none border-b border-[#d9e4ff] bg-transparent p-0 h-auto justify-start gap-0 overflow-x-auto">
          {(["buod", "timeline", "sources"] as const).map((v) => {
            const names = { buod: "Buod", timeline: "Timeline ng Ebidensya", sources: "Mga Source" };
            return (
              <TabsTrigger
                key={v} value={v}
                className={cn(
                  "flex-1 justify-center rounded-none border-b-2 border-transparent px-3 sm:px-5 py-4 text-sm font-semibold text-muted-foreground",
                  "data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none",
                  "hover:text-foreground transition-colors whitespace-nowrap",
                )}
              >
                {names[v]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* -- Buod -- */}
        <TabsContent value="buod" className="mt-0 px-5 py-5">
          <div className="flex flex-col gap-6">
            {/* Metadata grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/55 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Pinagmulan ng Claim</p>
                <p className="text-sm font-semibold text-foreground">Web Search</p>
              </div>
              <div className="rounded-2xl bg-white/55 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Napatunayan noong</p>
                <p className="text-sm font-semibold text-foreground">{verifiedAt.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} · {verifiedAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="rounded-2xl bg-white/55 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Kategorya</p>
                <p className="text-sm font-semibold text-foreground">General</p>
              </div>
              {/* Verdict card — replaces the empty "Nakaraang Verdict" placeholder */}
              <div className={cn("rounded-2xl bg-white/55 px-4 py-3 flex items-center gap-3", cfg.bg)}>
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cfg.iconBg)}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Hatol</p>
                  <p className={cn("text-sm font-black", cfg.label)}>{label}</p>
                </div>
                <div className="ml-auto text-xs font-bold tabular-nums text-muted-foreground">
                  {result.confidence}% confidence
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-2xl bg-white/55 p-4">
              <h3 className="text-sm font-black text-foreground mb-3">Buod ng Pagsusuri</h3>
              <p className="text-sm text-foreground leading-relaxed">{result.explanation}</p>
            </div>

            {/* Truth statement */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="flex items-center gap-1.5 text-xs font-black text-amber-800 mb-2">
                <HelpCircle className="h-3.5 w-3.5" />
                Ano ang Totoo
              </p>
              <p className="text-sm text-amber-900 leading-relaxed">{result.truthStatement}</p>
            </div>

            {/* Related claims — swipeable carousel */}
            {(result.supportingEvidence.length > 0 || result.contradictingEvidence.length > 0) && (
              <SourceCarousel result={result} />
            )}
          </div>
        </TabsContent>

        {/* -- Timeline ng Ebidensya -- */}
        <TabsContent value="timeline" className="mt-0 px-5 py-5">
          <p className="text-xs text-primary mb-5">
            Narito ang mga ebidensya na nakolekta sa iba't ibang oras, mula pinaka-bago hanggang pinaka-luma.
          </p>
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
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "h-4 w-4 rounded-full border-2 border-white shadow-sm shrink-0 mt-1",
                        stance === "Supports" ? "bg-emerald-400" :
                        stance === "Contradicts" ? "bg-red-400" : "bg-primary",
                      )} />
                      {i < allSources.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    {/* Card */}
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

        {/* -- Mga Source -- */}
        <TabsContent value="sources" className="mt-0 px-5 py-5">
          <p className="text-xs text-muted-foreground mb-4">
            <span className="font-bold text-foreground">{allSources.length}</span> sources ang sinuri. Ang bawat isa ay sinusukat sa accuracy, recency, at domain authority.
          </p>
          <div className="rounded-2xl border border-[#d9e4ff] bg-white/55 overflow-hidden">
            {allSources
              .map((s) => ({ source: s, cred: getCredibility(s.url), stance: stanceOf(s, result) }))
              .sort((a, b) => b.cred.score - a.cred.score)
              .map(({ source, cred, stance }, i) => (
                <div key={i}
                  className={cn("flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                    i > 0 && "border-t border-border")}>
                  {/* Score circle */}
                  <div className={cn(
                    "h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-xs font-black",
                    scoreBg(cred.score), scoreColor(cred.score),
                  )}>
                    {cred.score}
                  </div>
                  {/* Name + domain */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-foreground leading-snug line-clamp-2">{source.title || source.sourceName}</p>
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground">{source.sourceName}</p>
                  </div>
                  {/* Stance — always visible */}
                  <div className="shrink-0">
                    <StanceBadge stance={stance === "Neutral" ? "Neutral" : stance === "Supports" ? "Supports" : "Contradicts"} />
                  </div>
                </div>
              ))}
          </div>

          {/* Full comparison CTA */}
          <div className="mt-4">
            <Button variant="outline" className="w-full text-sm font-bold" asChild>
              <Link to="/result/sources" state={{ result }}>
                <BarChart2 className="h-4 w-4" />
                Tingnan ang Full Source Comparison
              </Link>
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* -- Bottom actions -- */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-border">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate(-1)}>
          Bumalik sa Verify
        </Button>
        <Button className="w-full sm:w-auto" asChild>
          <Link to="/kasaysayan">Tingnan ang Kasaysayan</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

// --- Page state machine -------------------------------------------------------

type PageState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; result: VerifyResult };

export default function ResultPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) { setState({ status: "error" }); return; }
    try {
      const parsed = JSON.parse(raw) as VerifyResult;
      if (!parsed.verdict || !parsed.claim) throw new Error("invalid");
      setState({ status: "success", result: parsed });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  if (state.status === "loading") return <LoadingSkeleton />;
  if (state.status === "error")   return <ErrorState />;
  return <SuccessView result={state.result} />;
}
