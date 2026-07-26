/**
 * HomePage — full landing page matching the Figma design.
 *
 * Sections:
 *  1. Hero          — full-bleed blue, dot-grid, headline, search bar, mascot
 *  2. Features      — "Bakit Teka Muna?" — 4 feature cards
 *  3. Recent Checks — "Kamakallan na Sinuri" — list rows with verdict badges
 *  4. CTA           — full-bleed blue, call-to-action
 */

import { useState, useRef } from "react";
import { Search, Zap, ShieldCheck, BarChart2, Globe, ArrowRight, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { VerdictBadge, type Verdict } from "@/components/shared/VerdictBadge";
import { MASCOT_URL } from "@/constants";

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

const RECENT_CHECKS: {
  id: number;
  claim: string;
  date: string;
  category: string;
  confidence: number;
  verdict: Verdict;
  highlight?: string;
}[] = [
  {
    id: 1,
    claim: "Ang Pilipinas ay may pinakamabilis na internet sa ASEAN",
    date: "Jul 24, 2026",
    category: "Teknolohiya",
    confidence: 82,
    verdict: "false",
    highlight: "pinakamabilis",
  },
  {
    id: 2,
    claim: "Libre ang tuition fee sa lahat ng state universities sa Pilipinas",
    date: "Jul 23, 2026",
    category: "Edukasyon",
    confidence: 96,
    verdict: "true",
    highlight: "Pilipinas",
  },
  {
    id: 3,
    claim: "Natuklasan ang bagong species ng hayop sa Mt. Apo",
    date: "Jul 22, 2026",
    category: "Kalikasan",
    confidence: 91,
    verdict: "true",
    highlight: undefined,
  },
  {
    id: 4,
    claim: "Ang Pilipinas ay sumali na sa BRICS bilang full member",
    date: "Jul 21, 2026",
    category: "Pulitika",
    confidence: 45,
    verdict: "unverified",
    highlight: "Pilipinas",
  },
];

const EXAMPLES = [
  "Ang Pilipinas ay may pinakamabilis na internet s...",
  "Si Jose Rizal ay hindi pinatay sa Luneta",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Highlighted text in a claim row */
function HighlightedClaim({
  claim,
  highlight,
}: {
  claim: string;
  highlight?: string;
}) {
  if (!highlight) return <span>{claim}</span>;
  const idx = claim.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <span>{claim}</span>;
  return (
    <span>
      {claim.slice(0, idx)}
      <span className="text-primary font-semibold underline">
        {claim.slice(idx, idx + highlight.length)}
      </span>
      {claim.slice(idx + highlight.length)}
    </span>
  );
}

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
  const [query, setQuery]     = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  const handleSuriin = () => {
    navigate("/verify", { state: { claim: query.trim() } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSuriin();
  };

  const fillExample = (ex: string) => {
    setQuery(ex.replace(/\.\.\.$/, ""));
    inputRef.current?.focus();
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
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm shadow-lg">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Powered by AI · Trusted by Pilipinos
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

            {/* Search bar */}
            <div className={`mt-8 flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-300 ${isExpanded ? "rounded-2xl" : "rounded-full"}`}>
              <div className="flex items-stretch">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder="I-type ang claim na gusto mong suriin..."
                  className="flex-1 bg-transparent px-6 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSuriin}
                  className="m-1.5 flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-white transition-all hover:bg-primary/90 hover:shadow-lg shrink-0"
                >
                  <Search className="h-4 w-4" />
                  Suriin
                </button>
              </div>
              {/* Expanded hint */}
              {isExpanded && (
                <div className="px-6 pb-3 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Pindutin ang <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> o i-click ang <strong>Suriin</strong> para magpatuloy
                  </span>
                </div>
              )}
            </div>

            {/* Example chips */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="text-xs font-semibold text-white/70">Halimbawa:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => fillExample(ex)}
                  className="text-left rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-medium text-white/95 transition-all hover:bg-white/15 hover:border-white/40 backdrop-blur-sm"
                >
                  "{ex}"
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: mascot ── */}
          <div className="hidden lg:flex flex-col items-center gap-4 shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl" />
              <img
                src={MASCOT_URL}
                alt="Teka mascot holding a magnifying glass"
                className="relative h-64 w-64 object-contain drop-shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white">Kumusta? Ako si Teka!</p>
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
            className="group rounded-2xl border-2 border-border bg-white p-6 flex flex-col gap-4 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
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
        <Link
          to="/kasaysayan"
          className="flex items-center gap-1 text-sm font-bold text-primary hover:underline transition-all"
        >
          Tingnan Lahat <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* List */}
      <div className="rounded-2xl border-2 border-border overflow-hidden bg-white shadow-sm">
        {RECENT_CHECKS.map((item, i) => (
          <button
            key={item.id}
            className={`w-full text-left flex items-center justify-between gap-6 px-6 py-5 hover:bg-muted/50 transition-all duration-200 ${
              i !== RECENT_CHECKS.length - 1 ? "border-b border-border" : ""
            }`}
          >
            {/* Left: claim + meta */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug mb-2">
                <HighlightedClaim claim={item.claim} highlight={item.highlight} />
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-medium">{item.date}</span>
                <CategoryPill label={item.category} />
              </div>
            </div>

            {/* Right: confidence + badge */}
            <div className="flex items-center gap-5 shrink-0">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                  Confidence
                </span>
                <span className="text-lg font-black text-foreground tabular-nums">{item.confidence}%</span>
              </div>
              <VerdictBadge verdict={item.verdict} confidence={item.confidence} size="sm" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="w-full bg-gradient-primary py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-0 flex flex-col items-center text-center gap-8">
        <div className="relative">
          <div className="absolute inset-0 bg-accent/30 rounded-full blur-2xl" />
          <img
            src={MASCOT_URL}
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
          className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-4 text-base font-black text-foreground shadow-xl hover:bg-accent/90 hover:shadow-2xl transition-all duration-300 hover:scale-105"
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
