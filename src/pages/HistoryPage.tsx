/**
 * HistoryPage (Kasaysayan ng Pagsusuri)
 *
 * Layout matches the design screenshot:
 *   • Page heading + subtitle
 *   • 4 stat cards (Totoo / Hindi Totoo / Mapanlinlang / Hindi Ma-verify)
 *   • Search bar + category filter chips (Lahat, Pulitika, Kalusugan, ...)
 *   • Claim list rows — date, category pill, verdict badge + confidence
 *
 * Data source: sessionStorage key "teka_history" — an array of VerifyResult.
 * Each time a verify completes, the result is appended to history.
 * If empty, shows seeded demo data so the page is never blank.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { VerdictBadge } from "@/components/shared/VerdictBadge";
import { Button } from "@/components/ui/button";
import {
  RESULT_STORAGE_KEY,
  FILTER_CATEGORIES,
  VERDICT_TYPES,
  APP_NAME,
} from "@/constants";
import { loadHistory, deleteFromHistory, clearHistory } from "@/services/historyService";
import { inferCategory, formatDate } from "@/utils/sources";
import type { VerifyResult, Verdict } from "@/types";
import { cn } from "@/lib/utils";

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

// Category derived from claim keywords — shared utility in @/utils/sources

// ─── Stat card ────────────────────────────────────────────────────────────────

const STAT_CONFIG: Record<Verdict, { label: string; numColor: string; bg: string; border: string }> = {
  true:       { label: "Totoo",           numColor: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200" },
  false:      { label: "Hindi Totoo",     numColor: "text-red-500",     bg: "bg-red-50",      border: "border-red-200"     },
  misleading: { label: "Mapanlinlang",    numColor: "text-amber-500",   bg: "bg-amber-50",    border: "border-amber-200"   },
  unverified: { label: "Hindi Ma-verify", numColor: "text-slate-500",   bg: "bg-slate-50",    border: "border-slate-200"   },
};

function StatCard({ verdict, count }: { verdict: Verdict; count: number }) {
  const cfg = STAT_CONFIG[verdict];
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5", cfg.bg, cfg.border)}>
      <span className={cn("text-3xl font-black tabular-nums sm:text-4xl", cfg.numColor)}>{count}</span>
      <span className="text-sm font-bold text-muted-foreground">{cfg.label}</span>
    </div>
  );
}

// ─── Claim row ────────────────────────────────────────────────────────────────

function ClaimRow({
  item,
  category,
  onClick,
  onDelete,
}: {
  item:     VerifyResult;
  category: string;
  onClick:  () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const date = formatDate(item.verifiedAt);

  // Highlight first keyword match in blue
  const highlighted = (() => {
    const words = item.claim.split(" ");
    // Bold the longest word that looks like a key term (>5 chars)
    let done = false;
    return words.map((w, i) => {
      if (!done && w.length > 5 && !/^(ang|mga|ng|sa|na|ay|at|ni|si|para|nang|kung|din|rin|yung|pero|kaya)$/i.test(w)) {
        done = true;
        return <span key={i}><strong className="font-bold text-primary">{w}</strong>{" "}</span>;
      }
      return <span key={i}>{w} </span>;
    });
  })();

  return (
    <div className="group flex items-center gap-1 border-b border-border transition-colors last:border-0 hover:bg-muted/40 sm:gap-2">
      <button
        onClick={onClick}
        className="flex min-h-20 min-w-0 flex-1 items-center justify-between gap-3 px-2 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:gap-6 sm:py-5"
      >
        {/* Left */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug mb-2">{highlighted}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">{date}</span>
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {category}
            </span>
          </div>
        </div>
        {/* Verdict */}
        <div className="shrink-0">
          <VerdictBadge verdict={item.verdict} confidence={item.confidence} size="sm" />
        </div>
      </button>
      {/* Delete button — visible on hover */}
      <button
        onClick={onDelete}
        aria-label="Burahin ang entry na ito"
        className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:mr-2 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<VerifyResult[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("Lahat");

  // Load from sessionStorage via historyService — show empty state if none
  useEffect(() => {
    document.title = `Kasaysayan ng Pagsusuri — ${APP_NAME}`;
    const stored = loadHistory();
    setHistory(stored);
  }, []);

  // Stats
  const stats = useMemo(() => ({
    true:       history.filter((h) => h.verdict === "true").length,
    false:      history.filter((h) => h.verdict === "false").length,
    misleading: history.filter((h) => h.verdict === "misleading").length,
    unverified: history.filter((h) => h.verdict === "unverified").length,
  }), [history]);

  // Pre-compute categories for the filtered list — avoids calling inferCategory
  // on every individual row render
  const filteredWithCategories = useMemo(() => {
    return history
      .map((item) => ({ item, category: inferCategory(item.claim) }))
      .filter(({ item, category }) => {
        const matchesSearch = search.trim() === "" ||
          item.claim.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = activeFilter === "Lahat" || category === activeFilter;
        return matchesSearch && matchesFilter;
      });
  }, [history, search, activeFilter]);

  const handleRowClick = useCallback((item: VerifyResult) => {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(item));
    void navigate("/result");
  }, [navigate]);

  const handleDelete = useCallback((verifiedAt: string) => {
    const ok = window.confirm("Sigurado ka ba na gusto mong burahin ang entry na ito?");
    if (!ok) return;
    deleteFromHistory(verifiedAt);
    setHistory((prev) => prev.filter((h) => h.verifiedAt !== verifiedAt));
  }, []);

  const handleClearAll = useCallback(() => {
    const ok = window.confirm("Sigurado ka ba na gusto mong burahin ang lahat ng iyong kasaysayan ng pagsusuri? Hindi na ito mababawi.");
    if (!ok) return;
    clearHistory();
    setHistory([]);
  }, []);

  return (
    <PageContainer className="animate-page-in max-w-[850px] pb-12">
      {/* ── Heading ── */}
      <div className="flex items-start justify-between gap-4 pb-8 pt-8 sm:pt-10">
        <div>
          <h1 className="text-3xl sm:text-[32px] font-black text-foreground">
            Kasaysayan ng Pagsusuri
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Lahat ng iyong nakaraang fact-check requests.
          </p>
        </div>
        {history.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 mt-2 text-xs gap-1.5 text-muted-foreground hover:text-red-500 hover:border-red-300"
            onClick={handleClearAll}
          >
            <Trash2 className="h-3.5 w-3.5" />
            I-clear Lahat
          </Button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {VERDICT_TYPES.map((v) => (
          <StatCard key={v} verdict={v as Verdict} count={stats[v as Verdict]} />
        ))}
      </div>

      {/* ── Search + filters ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hanapin ang claim..."
            className="min-h-11 w-full rounded-md border border-border bg-white py-3 pl-11 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Filter chips — horizontally scrollable */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1 min-w-0 w-full sm:w-auto">
          {FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-5 py-2 text-sm font-bold transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                activeFilter === cat
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Claim list ── */}
      <div className="overflow-hidden rounded-xl border border-[#d9e4ff] bg-[#f8faff] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {filteredWithCategories.length === 0 ? (
          <div className="tm-empty-state flex flex-col items-center justify-center gap-4 rounded-none border-0 px-6 py-16 text-center">
            <Search className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-base text-muted-foreground">
              {search ? `Walang nahanap para sa "${search}"` : "Wala pang kasaysayan ng pagsusuri."}
            </p>
          </div>
        ) : (
          <div className="px-3 sm:px-6">
            {filteredWithCategories.map(({ item, category }, i) => (
              <ClaimRow
                key={`${item.verifiedAt}-${i}`}
                item={item}
                category={category}
                onClick={() => handleRowClick(item)}
                onDelete={(e) => { e.stopPropagation(); handleDelete(item.verifiedAt); }}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
