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
  XCircle, HelpCircle, ThumbsUp, ThumbsDown, BarChart2, Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/PageContainer";
import { RESULT_STORAGE_KEY, VERDICT_LABELS, VERDICT_CONFIG, APP_NAME } from "@/constants";
import { getCredibility, scoreColor, scoreBg } from "@/lib/credibility";
import { uniqueEvidenceSources, formatDate, extractKeyFacts } from "@/utils/sources";
import type { VerifyResult } from "@/types";
import { cn } from "@/lib/utils";
import ShareCardButton from "@/components/shared/ShareCardButton";
import ShareButton from "@/components/shared/ShareButton";
import { stripMarkdown } from "@/utils/stripMarkdown";
import {
  ClaimBanner,
  ConfidencePanel,
  VerdictCard,
  VerdictTabs,
} from "@/components/result";

// ─── Verdict config (imported from constants) ───────────────────────────────
const V = VERDICT_CONFIG;

// --- Loading / Error skeletons ------------------------------------------------

function LoadingSkeleton() {
  return (
    <PageContainer className="pb-8">
      <div className="flex flex-col gap-5 pt-6">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="tm-skeleton h-16 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <div className="tm-skeleton h-64 rounded-xl" />
          <div className="tm-skeleton h-64 rounded-xl" />
        </div>
        <div className="tm-skeleton h-96 rounded-xl" />
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
          <Link to="/verify"><Search className="h-4 w-4" /> Suriin ang Claim</Link>
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
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {sources.map((s, i) => {
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
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const cfg = V[result.verdict];
  const { Icon } = cfg;
  const label = VERDICT_LABELS[result.verdict];
  const verifiedAt = new Date(result.verifiedAt);

  // Verdict card action buttons (page-specific)
  const actions = (
    <>
      <Button variant="outline" size="sm" className="text-xs" asChild>
        <Link to="/result/sources" state={{ result }}>
          <BarChart2 className="h-3.5 w-3.5" />
          Ikumpara ang Sources
        </Link>
      </Button>
      <ShareCardButton result={result} />
      <ShareButton result={result} />
    </>
  );

  // Feedback row rendered below the actions (page-specific footer)
  const feedbackFooter = (
    <div className="flex items-center gap-3 pt-1 border-t border-black/5">
      {feedback ? (
        <span className={`text-xs font-semibold ${
          feedback === "correct" ? "text-emerald-600" : "text-red-500"
        }`}>
          {feedback === "correct" ? "✓ Salamat sa iyong feedback!" : "✓ Salamat! Patuloy naming pagbubutihin."}
        </span>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">Tama ba ang hatol na ito?</span>
          <button
            onClick={() => setFeedback("correct")}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-emerald-600 transition-colors"
            aria-label="Tama ang hatol"
          >
            <ThumbsUp className="h-3.5 w-3.5" /> Oo
          </button>
          <button
            onClick={() => setFeedback("incorrect")}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-red-500 transition-colors"
            aria-label="Mali ang hatol"
          >
            <ThumbsDown className="h-3.5 w-3.5" /> Hindi
          </button>
        </>
      )}
    </div>
  );

  // "Buod" tab content (page-specific — has metadata grid + carousel)
  const buod = (
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
          <p className="text-sm font-semibold text-foreground">{result.category || "Pangkalahatan"}</p>
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
        <p className="text-sm text-foreground leading-relaxed">{stripMarkdown(result.explanation)}</p>
      </div>

      {/* Truth statement */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="flex items-center gap-1.5 text-xs font-black text-amber-800 mb-2">
          <HelpCircle className="h-3.5 w-3.5" />
          Ano ang Totoo
        </p>
        <p className="text-sm text-amber-900 leading-relaxed">{stripMarkdown(result.truthStatement)}</p>
      </div>

      {/* Related claims — swipeable carousel */}
      {(result.supportingEvidence.length > 0 || result.contradictingEvidence.length > 0) && (
        <SourceCarousel result={result} />
      )}
    </div>
  );

  // "Mga Source" tab footer — full-comparison CTA (page-specific)
  const sourcesFooter = (
    <div className="mt-4">
      <Button variant="outline" className="w-full text-sm font-bold" asChild>
        <Link to="/result/sources" state={{ result }}>
          <BarChart2 className="h-4 w-4" />
          Tingnan ang Full Source Comparison
        </Link>
      </Button>
    </div>
  );

  return (
    <PageContainer className="animate-page-in max-w-[850px] pb-12">

      {/* -- Breadcrumb -- */}
      <nav className="flex items-center gap-1.5 pt-8 pb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <span aria-hidden className="text-muted-foreground/50">›</span>
        <Link to="/verify" className="hover:text-foreground transition-colors">Suriin</Link>
        <span aria-hidden className="text-muted-foreground/50">›</span>
        <span className="font-semibold text-foreground">Resulta</span>
      </nav>

      {/* -- Claim banner -- */}
      <ClaimBanner claim={result.claim} />

      {/* -- Two-column: verdict + confidence -- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_270px] gap-5 mb-6">
        <VerdictCard
          result={result}
          titleId="ai-verdict-title"
          actions={actions}
          footer={feedbackFooter}
        />
        <ConfidencePanel result={result} />
      </div>

      {/* -- Three tabs -- */}
      <VerdictTabs
        result={result}
        buod={buod}
        timelineIntro={
          <p className="text-xs text-primary mb-5">
            Narito ang mga ebidensya na nakolekta sa iba't ibang oras, mula pinaka-bago hanggang pinaka-luma.
          </p>
        }
        sourcesFooter={sourcesFooter}
      />

      {/* -- Bottom actions -- */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-border">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate(-1)}>
          Bumalik sa Suriin
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

  useEffect(() => {
    if (state.status === "success") {
      document.title = `Resulta ng Pagsusuri — ${APP_NAME}`;
    } else if (state.status === "error") {
      document.title = `Walang Resulta — ${APP_NAME}`;
    }
  }, [state]);

  if (state.status === "loading") return <LoadingSkeleton />;
  if (state.status === "error")   return <ErrorState />;
  return <SuccessView result={state.result} />;
}
