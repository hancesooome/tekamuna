/**
 * SourceComparisonPage — /result/sources
 *
 * Two independent sections:
 *
 *   1. Overview table — each row is expandable showing a compact summary.
 *      No DetailCard here — avoids double render.
 *
 *   2. Detail card carousel — driven ONLY by the dot pagination.
 *      Not linked to table expansion.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/PageContainer";
import { RESULT_STORAGE_KEY, APP_NAME } from "@/constants";
import { getCredibility, scoreColor, scoreBg } from "@/lib/credibility";
import { allSourcesMerged, stanceOf, formatDate, extractKeyFacts } from "@/utils/sources";
import type { VerifyResult, Source } from "@/types";
import { cn } from "@/lib/utils";
import { stripMarkdown } from "@/utils/stripMarkdown";
import { StanceBadge } from "@/components/shared/StanceBadge";
import type { Stance } from "@/components/shared/StanceBadge";

// ─── Detail card (carousel only) ─────────────────────────────────────────────

function DetailCard({ source }: { source: Source }) {
  const { score, category } = getCredibility(source.url);
  const facts = extractKeyFacts(source.summary);

  const cardBg = score >= 90
    ? "bg-emerald-50 border-emerald-200"
    : score >= 65
      ? "bg-amber-50 border-amber-200"
      : "bg-red-50 border-red-200";

  return (
    <div className={cn("rounded-2xl border p-6 flex flex-col gap-4", cardBg)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={cn("text-base font-black leading-snug", scoreColor(score))}>
            {source.title || source.sourceName}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">{source.sourceName}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">{category}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-3xl font-black tabular-nums leading-none", scoreColor(score))}>{score}</p>
          <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">Credibility Score</p>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground leading-relaxed">{stripMarkdown(source.summary)}</p>

      {/* Key facts grid */}
      {facts.length > 0 && (
        <div>
          <p className="text-xs font-black text-foreground mb-2">Mga Key Facts</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {facts.map((fact, i) => (
              <div key={i} className="flex items-start gap-1.5 rounded-xl bg-white/60 px-3 py-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <p className="text-xs text-foreground leading-relaxed">{fact}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-black/5 pt-3 mt-1">
        <span className="text-[11px] text-muted-foreground">
          {source.publishedDate ? `Inilathala: ${formatDate(source.publishedDate)}` : "Petsa hindi available"}
        </span>
        <a href={source.url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
          Buksan ang Source <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Table row — clicking navigates the carousel below, no dropdown ──────────

function TableRow({
  source,
  stance,
  isActive,
  onClick,
}: {
  source:   Source;
  stance:   Stance;
  isActive: boolean;
  onClick:  () => void;
}) {
  const { score, category } = getCredibility(source.url);

  return (
    <tr
      className={cn(
        "cursor-pointer transition-colors",
        isActive
          ? "bg-primary/5 border-l-4 border-l-primary"
          : "hover:bg-muted/30 border-l-4 border-l-transparent",
      )}
      onClick={onClick}
    >
      {/* Source name */}
      <td className="py-3.5 pl-5 pr-3">
        <p className={cn(
          "text-sm font-bold leading-snug line-clamp-2",
          isActive ? "text-primary" : "text-foreground",
        )}>
          {source.title || source.sourceName}
        </p>
        <p className="text-[11px] text-primary mt-0.5">{source.sourceName}</p>
      </td>
      {/* Category */}
      <td className="py-3.5 px-3 hidden sm:table-cell">
        <span className="text-xs text-muted-foreground">{category}</span>
      </td>
      {/* Credibility score */}
      <td className="py-3.5 px-3 text-center">
        <span className={cn(
          "inline-flex items-center justify-center h-9 w-9 rounded-full text-sm font-black tabular-nums",
          scoreBg(score), scoreColor(score),
        )}>
          {score}
        </span>
      </td>
      {/* Date */}
      <td className="py-3.5 px-3 hidden md:table-cell">
        <span className="text-xs text-muted-foreground">{formatDate(source.publishedDate)}</span>
      </td>
      {/* Stance */}
      <td className="py-3.5 px-3">
        <StanceBadge stance={stance} />
      </td>
      {/* Active indicator */}
      <td className="py-3.5 pl-3 pr-5">
        {isActive && (
          <div className="h-2 w-2 rounded-full bg-primary mx-auto" />
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SourceComparisonView({ result }: { result: VerifyResult }) {
  const navigate = useNavigate();
  const sources   = allSourcesMerged(result);

  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const trackRef   = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false); // prevent scroll→index feedback loop

  useEffect(() => {
    document.title = `Paghahambing ng mga Source — ${APP_NAME}`;
  }, []);

  // Helper: get the width of one card from the DOM
  const getCardWidth = () => {
    const el = trackRef.current;
    if (!el) return 0;
    const firstCard = el.firstElementChild as HTMLElement | null;
    return firstCard ? firstCard.offsetWidth : el.scrollWidth / sources.length;
  };

  // Scroll → index (user swiping)
  const onScroll = useCallback(() => {
    if (isScrolling.current) return; // ignore programmatic scrolls
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = getCardWidth();
    if (cardWidth === 0) return;
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveCardIdx(Math.max(0, Math.min(sources.length - 1, idx)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length]);

  // Index → scroll (dots + table row clicks)
  const scrollToIdx = useCallback((idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    // Use rAF so the DOM has finished layout before we measure
    requestAnimationFrame(() => {
      const cardWidth = getCardWidth();
      if (cardWidth === 0) return;
      isScrolling.current = true;
      el.scrollTo({ left: cardWidth * idx, behavior: "smooth" });
      // Release the guard after the smooth scroll completes (~400ms)
      setTimeout(() => { isScrolling.current = false; }, 500);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToIdx(activeCardIdx);
  }, [activeCardIdx, scrollToIdx]);

  const handleSourceClick = (idx: number) => {
    setActiveCardIdx(idx);
    setTimeout(() => {
      document.getElementById("source-detail-card")?.scrollIntoView({
        behavior: "smooth", block: "start",
      });
    }, 50);
  };

  return (
    <PageContainer className="animate-page-in max-w-[980px] pb-12">

      {/* Back link */}
      <div className="pt-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Bumalik sa Resulta
        </button>
      </div>

      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-3xl font-black text-foreground">Source Comparison</h1>
        <p className="mt-1 text-sm text-primary">
          Ikumpara ang kung ano ang sinasabi ng bawat source tungkol sa claim.
        </p>
      </div>

      {/* ── Section 1: Overview table ── */}
      <div className="rounded-2xl border border-[#d9e4ff] bg-[#f8faff] overflow-hidden mb-6 shadow-sm">
        <div className="px-5 py-5 border-b border-[#d9e4ff] flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">Overview ng Lahat ng Sources</h2>
          <span className="text-xs text-muted-foreground">I-click ang row para makita ang detalye ↓</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#d9e4ff] bg-primary/5">
                {["Source", "URI", "Cred. Score", "Inilathala", "Stance", ""].map((h, i) => (
                  <th key={i}
                    className={cn(
                      "py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground",
                      i === 0 && "pl-5 pr-3",
                      i === 1 && "px-3 hidden sm:table-cell",
                      i === 2 && "px-3 text-center",
                      i === 3 && "px-3 hidden md:table-cell",
                      i === 4 && "px-3",
                      i === 5 && "pl-3 pr-5 w-8",
                    )}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d9e4ff]">
              {sources.map((source, i) => (
                <TableRow
                  key={source.url}
                  source={source}
                  stance={stanceOf(source, result)}
                  isActive={activeCardIdx === i}
                  onClick={() => handleSourceClick(i)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 2: Swipeable detail card carousel ── */}
      {sources.length > 0 && (
        <div id="source-detail-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-foreground">
              {sources[activeCardIdx].sourceName}
            </h2>
            <span className="text-xs font-bold text-muted-foreground tabular-nums">
              {activeCardIdx + 1} / {sources.length}
            </span>
          </div>

          <div
            ref={trackRef}
            onScroll={onScroll}
            className="flex overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {sources.map((source, i) => (
              <div key={source.url ?? i} className="shrink-0 w-full snap-center">
                <DetailCard source={source} />
              </div>
            ))}
          </div>

          {sources.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              {sources.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveCardIdx(i)}
                  aria-label={`Source ${i + 1}`}
                  className={cn(
                    "h-2 rounded-full transition-all duration-200",
                    i === activeCardIdx
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

export default function SourceComparisonPage() {
  const location = useLocation();

  const result: VerifyResult | null = (() => {
    if (location.state?.result) return location.state.result as VerifyResult;
    try {
      const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as VerifyResult;
    } catch { /* ignore */ }
    return null;
  })();

  if (!result) {
    return (
      <PageContainer className="pb-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Walang data. Bumalik sa resulta at subukan ulit.
          </p>
          <Button asChild><Link to="/verify">Suriin ang Claim</Link></Button>
        </div>
      </PageContainer>
    );
  }

  return <SourceComparisonView result={result} />;
}
