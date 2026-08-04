/**
 * HomePage — full landing page matching the Figma design.
 *
 * Sections:
 *  1. Hero          — full-bleed blue, dot-grid, headline, search bar, mascot
 *  2. Features      — "Bakit Teka Muna?" — 4 feature cards
 *  3. Recent Checks — "Kamakallan na Sinuri" — list rows with verdict badges
 *  4. CTA           — full-bleed blue, call-to-action
 */

import { useState, useRef, useEffect } from "react";
import { Search, Zap, ShieldCheck, BarChart2, Globe, ArrowRight, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { VerdictBadge } from "@/components/shared/VerdictBadge";
import { LOGO_ICON_URL, MASCOT_URL, CATEGORY_KEYWORD_MAP } from "@/constants";
import { loadHistory } from "@/services/historyService";
import type { VerifyResult } from "@/types";

// ─── Static data ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Zap,
    title: "Real-time Analysis",
    description: (
      <>
        Sinusuri ng AI ang iyong claim sa loob ng ilang segundo gamit ang{" "}
        <span className="text-primary font-semibold">daan-daang</span>{" "}
        <span className="text-primary font-semibold">pinagkakatiwalaang sources</span>.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Credibility Scoring",
    description: (
      <>
        Bawat claim ay may kalakip na confidence score at{" "}
        <span className="text-primary font-semibold">detalyadong breakdown</span> ng evidence.
      </>
    ),
  },
  {
    icon: BarChart2,
    title: "Source Comparison",
    description: (
      <>
        Ikumpara ang iba't ibang perspective mula sa verified news outlets at{" "}
        <span className="text-primary font-semibold">academic papers</span>.
      </>
    ),
  },
  {
    icon: Globe,
    title: "Filipino-First",
    description: (
      <>
        Sumusuporta sa Filipino at English. Dinisenyo para sa mga{" "}
        <span className="text-primary font-semibold">balitang lokal at panlabas</span>.
      </>
    ),
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferCategory(claim: string): string {
  for (const [key, cat] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (claim.includes(key)) return cat;
  }
  return "Pangkalahatan";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Category pill */
function CategoryPill({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      {label}
    </span>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function HeroSection() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = query.trim().length >= 10;

  const handleSuriin = () => {
    if (!canSubmit) return;
    void navigate("/verify", { state: { claim: query.trim(), autoSubmit: true } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSuriin();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  const isExpanded = focused || query.length > 0;

  return (
    <section className="relative w-full overflow-hidden bg-gradient-primary">
      {/* Dot grid overlay */}
      <div className="bg-dot-grid absolute inset-0 pointer-events-none" />

      {/* Wave bottom separator */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-[0]">
        <svg
          viewBox="0 0 1440 56"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full block"
          preserveAspectRatio="none"
          height="56"
        >
          <path
            d="M0,32 C360,56 1080,8 1440,32 L1440,56 L0,56 Z"
            fill="white"
          />
        </svg>
      </div>

      <div className="relative mx-auto max-w-[1100px] px-5 sm:px-6 lg:px-0 pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:justify-between">

          {/* ── Left: text + search ── */}
          <div className="flex-1 max-w-xl text-white">
            {/* Badge pill */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold text-white shadow-sm">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Powered by AI · Built for Every Juan
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight text-white">
              Bago maniwala,<br/>
              <span className="text-accent">Teka Muna.</span>
            </h1>

            {/* Sub-headline */}
            <p className="mt-5 text-base sm:text-lg text-white/90 leading-relaxed max-w-lg">
              Ang Teka Muna ay isang AI-powered fact-checking platform na tumutulong sa mga
              Pilipino na makilala ang katotohanan mula sa maling impormasyon.
            </p>

            {/* Search bar — single line until focused, then expands */}
            <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] ring-1 ring-black/5 transition-shadow duration-150 focus-within:ring-4 focus-within:ring-white/25">
              {!isExpanded ? (
                /* Collapsed: single-line look with inline button */
                <div className="flex items-center">
                  <input
                    type="text"
                    readOnly
                    onFocus={() => setFocused(true)}
                    placeholder="I-type ang claim na gusto mong suriin..."
                    className="min-h-14 flex-1 cursor-text bg-transparent px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none sm:px-6"
                  />
                  <button
                    type="button"
                    onClick={() => setFocused(true)}
                    className="m-1.5 flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-6"
                  >
                    <Search className="h-4 w-4" />
                    Suriin
                  </button>
                </div>
              ) : (
                /* Expanded: full textarea + button below */
                <>
                  <textarea
                    ref={textareaRef}
                    autoFocus
                    rows={2}
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={() => { if (!query) setFocused(false); }}
                    placeholder="I-type ang claim na gusto mong suriin..."
                    className="w-full resize-none overflow-hidden bg-transparent px-6 pt-4 pb-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
                  />
                  <div className="flex justify-end px-2 pb-2">
                    <button
                      type="button"
                      onClick={handleSuriin}
                      disabled={!canSubmit}
                      className="flex min-h-11 items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Search className="h-4 w-4" />
                      Suriin
                    </button>
                  </div>
                </>
              )}
            </div>


          </div>

          {/* ── Right: mascot ── */}
          <div className="hidden lg:flex flex-col items-center gap-4 shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl" />
              <img
                src={MASCOT_URL}
                alt="Teka mascot holding a magnifying glass"
                className="relative h-96 w-96 object-contain drop-shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white">Kumusta? Ako si Muna!</p>
              <p className="text-sm text-white/80 mt-1">Ang inyong AI fact-checking na kasama</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="mx-auto max-w-[1100px] px-5 sm:px-6 lg:px-0 py-16 sm:py-24">
      {/* Header */}
      <div className="text-center mb-14">
        <span className="inline-block rounded-full bg-primary/10 px-5 py-2 text-xs font-black uppercase tracking-wider text-primary mb-4">
          Mga Tampok
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight">
          Bakit Teka Muna?
        </h2>
        <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Pinagsama ang advanced AI at trusted Filipino news sources para sa pinaka-komprehensibong
          fact-checking na karanasan.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="group flex flex-col gap-4 rounded-xl border border-border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] duration-150 hover:border-primary/25 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentChecksSection() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<VerifyResult[]>([]);

  useEffect(() => {
    setRecent(loadHistory().slice(0, 5));
  }, []);

  const handleRowClick = (item: VerifyResult) => {
    sessionStorage.setItem("teka_verify_result", JSON.stringify(item));
    void navigate("/result");
  };

  return (
    <section className="mx-auto max-w-[1100px] px-5 sm:px-6 lg:px-0 pb-16 sm:pb-24">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground">Kamakallan na Sinuri</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Mga pinakabagong claim na na-verify ng aming AI
          </p>
        </div>
        {recent.length > 0 && (
          <Link
            to="/kasaysayan"
            className="flex items-center gap-1 text-sm font-bold text-primary hover:underline transition-all"
          >
            Tingnan Lahat <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        /* Empty state — no history yet */
        <div className="tm-empty-state flex flex-col items-center justify-center gap-4 px-6 py-12 text-center sm:px-8">
          <Search className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-base font-bold text-muted-foreground">Wala pang na-verify na claim.</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            I-verify ang iyong unang claim at lalabas ito dito.
          </p>
          <Link
            to="/verify"
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Magsimula <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        /* Real history rows */
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {recent.map((item, i) => (
            <button
              key={item.verifiedAt}
              onClick={() => handleRowClick(item)}
              className={`flex min-h-20 w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:gap-6 sm:px-6 ${
                i !== recent.length - 1 ? "border-b border-border" : ""
              }`}
            >
              {/* Left: claim + meta */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug mb-2 line-clamp-2">
                  {item.claim}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatDate(item.verifiedAt)}
                  </span>
                  <CategoryPill label={inferCategory(item.claim)} />
                </div>
              </div>

              {/* Right: confidence + badge */}
              <div className="flex items-center gap-5 shrink-0">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                    Confidence
                  </span>
                  <span className="text-lg font-black text-foreground tabular-nums">
                    {item.confidence}%
                  </span>
                </div>
                <VerdictBadge verdict={item.verdict} confidence={item.confidence} size="sm" />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CTASection() {
  return (
    <section className="w-full bg-gradient-primary py-12 sm:py-24">
      <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-0 flex flex-col items-center text-center gap-8">
        <div className="relative">
          <div className="absolute inset-0 bg-accent/30 rounded-full blur-2xl" />
          <img
            src={LOGO_ICON_URL}
            alt="Teka mascot"
            className="relative h-20 w-20 object-contain drop-shadow-xl"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight max-w-2xl">
          Handa ka na bang makipaglaban sa fake news?
        </h2>
        <p className="text-base sm:text-lg text-white/90 max-w-xl leading-relaxed">
          Samahan si Teka sa laban kontra sa maling impormasyon. Libre, mabilis, at mapagkakatiwalaan.
        </p>
        <Link
          to="/verify"
          className="inline-flex min-h-12 items-center gap-2 rounded-md bg-accent px-8 py-3 text-base font-black text-foreground shadow-sm transition-[background-color,box-shadow] hover:bg-accent/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
        >
          Magsimula Na <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="animate-page-in">
      <HeroSection />
      <FeaturesSection />
      <RecentChecksSection />
      <CTASection />
    </div>
  );
}
