/**
 * AboutPage (Tungkol Sa Amin) — full page matching the Figma design.
 *
 * Sections:
 *  1. Hero          — mascot, title, description with colour highlights
 *  2. Mission/Vision — two cards (blue + amber)
 *  3. Process       — "Paano Namin Sinusuri" — 6 numbered step cards
 *  4. Team          — "Ang Aming Koponan" — 6 avatar cards
 *  5. Partners      — "Mga Kasosyo" — pill grid
 *  6. Awards        — "Mga Parangal at Pagkilala" — blue banner
 */

import { ShieldCheck, TrendingUp, Medal } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { MASCOT_URL } from "@/constants";

// ─── Static data ─────────────────────────────────────────────────────────────

const PROCESS_STEPS = [
  {
    num: "01",
    title: "Claim Submission",
    description: (
      <>
        Tinatanggap ang iyong claim at bina-validate — dapat hindi bababa sa{" "}
        <span className="text-primary font-semibold underline">5 characters</span> at
        hindi hihigit sa <span className="text-primary font-semibold underline">1,000 characters</span>.
      </>
    ),
  },
  {
    num: "02",
    title: "Web Search via Tavily",
    description: (
      <>
        Naghahanap kami ng pinaka-relevant na{" "}
        <span className="text-primary font-semibold underline">web sources</span> gamit
        ang Tavily Search API — mula sa balita, gobyerno, at akademikong websites.
      </>
    ),
  },
  {
    num: "03",
    title: "Credibility Scoring",
    description:
      "Bawat source ay binibigyan ng credibility score (0–100) base sa domain — government, fact-checkers, at major media ay may mataas na score.",
  },
  {
    num: "04",
    title: "Top Source Selection",
    description: (
      <>
        Pinipili ang{" "}
        <span className="text-primary font-semibold underline">top 5 sources</span>{" "}
        base sa credibility score para ipadala sa AI — nagpapanatili ng maliit na prompt
        para makatipid ng quota.
      </>
    ),
  },
  {
    num: "05",
    title: "AI Verdict Generation",
    description:
      "Ang AI (OpenRouter o Gemini) ay nag-aanalisa ng mga source at nagbibigay ng verdict: Totoo, Hindi Totoo, Mapanlinlang, o Hindi Ma-verify — kasama ang confidence score.",
  },
  {
    num: "06",
    title: "Result Assembly",
    description:
      "Pinagsama-sama ang verdict, explanation, supporting at contradicting evidence, at lahat ng sources — ibinabalik sa user bilang kumpletong fact-check result.",
  },
] as const;

const TEAM_MEMBERS = [
  { initials: "MS", name: "Dr. Maria Santos", role: "Chief AI Researcher", color: "bg-primary" },
  { initials: "JC", name: "Juan dela Cruz", role: "Lead Engineer", color: "bg-cyan-500" },
  { initials: "AR", name: "Ana Reyes", role: "Journalism Director", color: "bg-amber-500" },
  { initials: "MT", name: "Miguel Torres", role: "Data Scientist", color: "bg-emerald-500" },
  { initials: "SB", name: "Sofia Bautista", role: "UX Design Lead", color: "bg-violet-500" },
  { initials: "CM", name: "Carlo Mendoza", role: "Policy Advisor", color: "bg-orange-500" },
] as const;

const PARTNERS = [
  "Philippine Statistics Authority",
  "DICT Philippines",
  "Vera Files",
  "Rappler",
  "ABS-CBN News",
  "Philippine Daily Inquirer",
  "Ateneo de Manila University",
  "UP Diliman",
] as const;

const AWARDS = [
  {
    title: "Best Government Tech Innovation",
    org: "GovTech Awards PH 2025",
  },
  {
    title: "Excellence in Digital Journalism",
    org: "NUIP Digital Awards 2025",
  },
  {
    title: "Best Civic Technology Platform",
    org: "ICT Industry Awards 2025",
  },
] as const;

// ─── Section components ───────────────────────────────────────────────────────

function HeroSection() {
  return (
    <div className="flex flex-col items-center text-center pt-10 pb-14 sm:pt-11 sm:pb-16 gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
        <img
          src={MASCOT_URL}
          alt="Teka mascot"
          className="relative h-24 w-24 sm:h-28 sm:w-28 object-contain drop-shadow-lg"
          referrerPolicy="no-referrer"
        />
      </div>
      <div>
        <h1 className="text-3xl sm:text-[36px] font-black text-foreground tracking-tight">
          Tungkol sa Teka Muna
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground max-w-[650px] mx-auto">
          Ang Teka Muna ay isang{" "}
          <span className="text-primary font-bold">non-profit AI-powered</span>{" "}
          <span className="text-primary font-bold">fact-checking platform</span> na nakatuon sa
          pagtulong sa{" "}
          <span className="text-primary font-bold">mga Pilipino</span> na makilala ang
          katotohanan sa gitna ng maling impormasyon.
        </p>
      </div>
    </div>
  );
}

function MissionVisionSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-14 sm:mb-16">
      {/* Mission — blue */}
      <div className="rounded-2xl bg-gradient-primary p-7 text-white shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 mb-5">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black mb-3">Aming Misyon</h2>
        <p className="text-sm sm:text-base text-white/90 leading-relaxed">
          Magbigay ng madaling ma-access, libre, at mapagkakatiwalaang fact-checking para sa bawat
          Pilipino — lalo na sa mga komunidad na mahirap maabot ng tradisyunal na media.
        </p>
      </div>

      {/* Vision — yellow */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-7 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 mb-5">
          <TrendingUp className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-foreground mb-3">Aming Bisyon</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Isang Pilipinas kung saan ang lahat ay may access sa verified na impormasyon — isang
          lipunang mas matalino, mas maingat, at{" "}
          <span className="text-amber-700 font-bold">hindi madaling malinlang</span> ng fake news.
        </p>
      </div>
    </div>
  );
}

function ProcessSection() {
  return (
    <div className="mb-14 sm:mb-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-[26px] font-black text-foreground">Paano Namin Sinusuri</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl mx-auto">
          Ang aming{" "}
          <span className="text-primary font-bold">6-step</span> na proseso para sa bawat claim —
          mula sa web search hanggang AI verdict
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {PROCESS_STEPS.map((step) => (
          <div
            key={step.num}
          className="group rounded-2xl border border-[#d9e4ff] bg-[#f8faff] p-5 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
          >
            <span className="inline-block text-[28px] font-black text-primary/20 leading-none mb-3">
              {step.num}
            </span>
            <h3 className="text-base font-black text-foreground mb-2">{step.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore -- temporarily hidden from UI
function TeamSection() {
  return (
    <div className="mb-14 sm:mb-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-[26px] font-black text-foreground">Ang Aming Koponan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mga eksperto sa AI, journalism, at data science
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {TEAM_MEMBERS.map((member) => (
          <div
            key={member.initials}
            className="group rounded-2xl border border-[#d9e4ff] bg-[#f8faff] p-5 flex flex-col items-center gap-3 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
          >
            <div
              className={`h-14 w-14 rounded-2xl ${member.color} flex items-center justify-center text-white text-lg font-black shadow-md group-hover:scale-110 transition-transform`}
            >
              {member.initials}
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-foreground">{member.name}</p>
              <p className="text-xs text-primary font-semibold mt-1">{member.role}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartnersSection() {
  return (
    <div className="mb-14 sm:mb-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-[26px] font-black text-foreground">Mga Kasosyo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mga pinagkakatiwalaang organisasyon na nagbibigay ng datos at suporta
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PARTNERS.map((partner) => (
          <div
            key={partner}
            className="rounded-xl border border-[#d9e4ff] bg-[#f8faff] px-4 py-3 text-center text-xs font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 hover:shadow-md transition-all duration-300"
          >
            {partner}
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore -- temporarily hidden from UI
function AwardsSection() {
  return (
    <div className="mb-16">
      <div className="rounded-2xl bg-gradient-primary p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
            <Medal className="h-6 w-6 text-accent" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Mga Parangal at Pagkilala</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {AWARDS.map((award) => (
            <div key={award.title} className="rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10 hover:bg-white/20 transition-all duration-300">
              <p className="text-sm font-black text-white leading-tight mb-1">{award.title}</p>
              <p className="text-xs text-white/80">{award.org}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <PageContainer className="animate-page-in">
      <HeroSection />
      <MissionVisionSection />
      <ProcessSection />
      {/* <TeamSection /> */}
      <PartnersSection />
      {/* <AwardsSection /> */}
    </PageContainer>
  );
}
