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
import { Search } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { VerdictBadge } from "@/components/shared/VerdictBadge";
import {
  RESULT_STORAGE_KEY,
  FILTER_CATEGORIES,
  CATEGORY_KEYWORD_MAP,
} from "@/constants";
import { loadHistory } from "@/services/historyService";
import type { VerifyResult, Verdict } from "@/types";
import { cn } from "@/lib/utils";

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO: VerifyResult[] = [
  {
    claim: "Ang Pilipinas ay may pinakamabilis na Internet sa ASEAN",
    verdict: "false",
    confidence: 23,
    explanation: "",
    truthStatement: "",
    supportingEvidence: [],
    contradictingEvidence: [],
    reliableSources: [],
    mascotAdvice: "",
    searchResultsCount: 8,
    verifiedAt: "2026-07-25T10:32:00.000Z",
  },
  {
    claim: "Libre ang tuition fee sa lahat ng state universities",
    verdict: "true",
    confidence: 96,
    explanation: "",
    truthStatement: "",
    supportingEvidence: [],
    contradictingEvidence: [],
    reliableSources: [],
    mascotAdvice: "",
    searchResultsCount: 9,
    verifiedAt: "2026-07-24T08:15:00.000Z",
  },
  {
    claim: "Si Fernando Poe Jr. ay namatay sa natural na kamatayan",
    verdict: "misleading",
    confidence: 61,
    explanation: "",
    truthStatement: "",
    supportingEvidence: [],
    contradictingEvidence: [],
    reliableSources: [],
    mascotAdvice: "",
    searchResultsCount: 5,
    verifiedAt: "2026-07-23T14:00:00.000Z",
  },
  {
    claim: "Pinamamahalaan ng China ang West Philippine Sea ng ganap na",
    verdict: "false",
    confidence: 15,
    explanation: "",
    truthStatement: "",
    supportingEvidence: [],
    contradictingEvidence: [],
    reliableSources: [],
    mascotAdvice: "",
    searchResultsCount: 10,
    verifiedAt: "2026-07-22T09:45:00.000Z",
  },
  {
    claim: "Ang Pilipinas ay sumali na sa BRICS bilang full member",
    verdict: "unverified",
    confidence: 45,
    explanation: "",
    truthStatement: "",
    supportingEvidence: [],
    contradictingEvidence: [],
    reliableSources: [],
    mascotAdvice: "",
    searchResultsCount: 6,
    verifiedAt: "2026-07-21T11:20:00.000Z",
  },
  {
    claim: "100% renewable energy na ang Siargao Island",
    verdict: "true",
    confidence: 88,
    explanation: "",
    truthStatement: "",
    supportingEvidence: [],
    contradictingEvidence: [],
    reliableSources: [],
    mascotAdvice: "",
    searchResultsCount: 7,
    verifiedAt: "2026-07-20T16:30:00.000Z",
  },
];

// Category derived from claim keywords (demo only — real data would store category)
function inferCategory(claim: string): string {
  for (const [key, cat] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (claim.includes(key)) return cat;
  }
  return "Pangkalahatan";
}

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
    <div className={cn("rounded-xl border-2 p-5 flex flex-col gap-2 shadow-sm hover:shadow-md transition-all", cfg.bg, cfg.border)}>
      <span className={cn("text-4xl font-black tabular-nums", cfg.numColor)}>{count}</span>
      <span className="text-sm font-bold text-muted-foreground">{cfg.label}</span>
    </div>
  );
}

// ─── Claim row ────────────────────────────────────────────────────────────────

function ClaimRow({
  item,
  category,
  onClick,
}: {
  item:     VerifyResult;
  category: string;
  onClick:  () => void;
}) {
  const date = new Date(item.verifiedAt).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });

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
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-6 py-5 border-b border-border hover:bg-muted/40 transition-all last:border-0 px-2"
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
      {/* Right */}
      <div className="shrink-0">
        <VerdictBadge verdict={item.verdict} confidence={item.confidence} size="sm" />
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<VerifyResult[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("Lahat");

  // Load from sessionStorage via historyService, fall back to demo data
  useEffect(() => {
    const stored = loadHistory();
    setHistory(stored.length > 0 ? stored : DEMO);
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

  return (
    <PageContainer className="animate-page-in max-w-[850px] pb-12">
      {/* ── Heading ── */}
      <div className="pt-9 pb-8">
        <h1 className="text-3xl sm:text-[32px] font-black text-foreground">
          Kasaysayan ng Pagsusuri
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Lahat ng iyong nakaraang fact-check requests.
        </p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(["true", "false", "misleading", "unverified"] as Verdict[]).map((v) => (
          <StatCard key={v} verdict={v} count={stats[v]} />
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
            className="w-full rounded-xl border-2 border-border bg-white pl-11 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Filter chips — horizontally scrollable */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1 min-w-0 w-full sm:w-auto">
          {FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={cn(
                "shrink-0 rounded-full px-5 py-2 text-sm font-bold transition-all duration-300",
                activeFilter === cat
                  ? "bg-primary text-white shadow-md scale-105"
                  : "bg-white border-2 border-border text-foreground hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Claim list ── */}
      <div className="rounded-2xl border border-[#d9e4ff] bg-[#f8faff] overflow-hidden shadow-sm">
        {filteredWithCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Search className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-base text-muted-foreground">
              {search ? `Walang nahanap para sa "${search}"` : "Wala pang kasaysayan ng pagsusuri."}
            </p>
          </div>
        ) : (
          <div className="px-6 sm:px-7">
            {filteredWithCategories.map(({ item, category }, i) => (
              <ClaimRow
                key={`${item.verifiedAt}-${i}`}
                item={item}
                category={category}
                onClick={() => handleRowClick(item)}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
