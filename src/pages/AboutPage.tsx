/**
 * AboutPage (Tungkol Sa Amin) — full page matching the Figma design.
 *
 * Sections:
 *  1. Hero          — mascot, title, description with colour highlights
 *  2. Mission/Vision — two cards (blue + amber)
 *  3. Process       — "Paano Namin Sinusuri" — 6 numbered step cards
 *  4. Team          — "Ang Aming Koponan" — 6 avatar cards
 *  5. Partners      — "Trusted Sources" — logo grid grouped by category
 *  6. Awards        — "Mga Parangal at Pagkilala" — blue banner
 */

import { ShieldCheck, TrendingUp } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { LOGO_ICON_URL } from "@/constants";

// ─── Static data ─────────────────────────────────────────────────────────────

const PROCESS_STEPS = [
  {
    num: "01",
    title: "Isinumite ang Claim",
    description:
      "Ilagay ang claim, balita, o pahayag na gusto mong suriin. Sisiguraduhin muna naming kumpleto at maayos ang iyong isinumite bago ito iproseso.",
  },
  {
    num: "02",
    title: "Naghahanap ng Mapagkakatiwalaang Sanggunian",
    description:
      "Awtomatiko kaming naghahanap ng kaugnay na impormasyon mula sa iba't ibang mapagkakatiwalaang website tulad ng mga news outlet, opisyal na ahensya ng gobyerno, at iba pang mapagkakatiwalaang sanggunian.",
  },
  {
    num: "03",
    title: "Sinusuri ang mga Sanggunian",
    description:
      "Hindi lahat ng website ay pare-pareho ang kredibilidad. Mas binibigyan namin ng halaga ang impormasyon mula sa mga opisyal na ahensya, fact-checking organizations, at kilalang media.",
  },
  {
    num: "04",
    title: "Pinipili ang Pinakamahuhusay na Ebidensya",
    description:
      "Mula sa lahat ng nahanap na impormasyon, pinipili namin ang mga pinaka-mapagkakatiwalaan at pinaka-angkop na sanggunian upang maging batayan ng pagsusuri.",
  },
  {
    num: "05",
    title: "Sinusuri ng AI ang Ebidensya",
    description: (
      <>
        Tinutulungan kami ng AI na ihambing ang claim sa mga nakalap na ebidensya at magbigay ng
        paunang resulta kung ito ay{" "}
        <span className="text-primary font-semibold">Totoo</span>,{" "}
        <span className="text-primary font-semibold">Hindi Totoo</span>,{" "}
        <span className="text-primary font-semibold">Mapanlinlang</span>, o{" "}
        <span className="text-primary font-semibold">Hindi Ma-verify</span>.
      </>
    ),
  },
  {
    num: "06",
    title: "Ipinapakita ang Resulta",
    description:
      "Makikita mo ang aming naging pasya, paliwanag, mga ebidensyang sumusuporta o sumasalungat sa claim, at ang mga pinagkunang ginamit sa pagsusuri.",
  },
] as const;

const TRUSTED_SOURCES = [
  {
    group: "Fact-Checking",
    items: [
      { name: "Vera Files",         logo: "/logos/verafiles.svg",         url: "https://verafiles.org",              alt: "Vera Files — Philippine fact-checking organization" },
      { name: "Rappler Fact Check", logo: "/logos/rappler.svg",           url: "https://www.rappler.com/factcheck",  alt: "Rappler — Philippine digital news and fact-checking outlet" },
      { name: "AFP Fact Check",     logo: "/logos/afp.png",               url: "https://factcheck.afp.com",          alt: "AFP Fact Check — Agence France-Presse global fact-checking" },
      { name: "FactCheck.org",      logo: "/logos/fact-check-org.png",    url: "https://www.factcheck.org",          alt: "FactCheck.org — non-partisan fact-checking by Annenberg Public Policy Center" },
    ],
  },
  {
    group: "Philippine Government",
    items: [
      { name: "Official Gazette",   logo: "/logos/Official_Gazette.png",  url: "https://www.officialgazette.gov.ph", alt: "Official Gazette of the Republic of the Philippines" },
      { name: "COMELEC",            logo: "/logos/comelec.svg",           url: "https://www.comelec.gov.ph",         alt: "Commission on Elections (COMELEC)" },
      { name: "PSA",                logo: "/logos/psa.svg",               url: "https://www.psa.gov.ph",             alt: "Philippine Statistics Authority (PSA)" },
      { name: "DOH",                logo: "/logos/doh.svg",               url: "https://www.doh.gov.ph",             alt: "Department of Health Philippines (DOH)" },
      { name: "DICT",               logo: "/logos/dict.svg",              url: "https://www.dict.gov.ph",            alt: "Department of Information and Communications Technology (DICT)" },
    ],
  },
  {
    group: "Reputable News Media",
    items: [
      { name: "GMA News",                logo: "/logos/gmanews.svg",          url: "https://www.gmanetwork.com/news",    alt: "GMA News — Philippine television and online news network" },
      { name: "ABS-CBN News",            logo: "/logos/abscbn.svg",           url: "https://news.abs-cbn.com",           alt: "ABS-CBN News — Philippine broadcast media" },
      { name: "Philippine Daily Inquirer",logo: "/logos/pdi.svg",             url: "https://www.inquirer.net",           alt: "Philippine Daily Inquirer — Philippine broadsheet newspaper" },
      { name: "Manila Bulletin",         logo: "/logos/manila_bulletin.svg",  url: "https://mb.com.ph",                  alt: "Manila Bulletin — Philippine newspaper" },
      { name: "The Philippine Star",     logo: "/logos/philippine_star.png",  url: "https://www.philstar.com",           alt: "The Philippine Star — Philippine broadsheet newspaper" },
    ],
  },
] as const;

// ─── Section components ───────────────────────────────────────────────────────

function HeroSection() {
  return (
    <div className="flex flex-col items-center text-center pt-10 pb-14 sm:pt-11 sm:pb-16 gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
        <img
          src={LOGO_ICON_URL}
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
      <div className="rounded-xl bg-gradient-primary p-6 text-white shadow-[0_8px_24px_rgba(26,86,219,0.16)] sm:p-7">
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-7">
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
        <h2 className="text-2xl sm:text-[26px] font-black text-foreground">Paano Namin Sinusuri ang Impormasyon</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl mx-auto">
          Ganito namin sinusuri ang bawat claim bago ito bigyan ng resulta.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {PROCESS_STEPS.map((step) => (
          <div
            key={step.num}
          className="group rounded-xl border border-[#d9e4ff] bg-[#f8faff] p-5 transition-[border-color,box-shadow] duration-150 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
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

function TrustedSourcesSection() {
  return (
    <div className="mb-14 sm:mb-16">
      {/* Heading — centered */}
      <div className="text-center mb-3">
        <h2 className="text-2xl sm:text-[26px] font-black text-foreground">Trusted Sources</h2>
      </div>

      {/* Disclaimer — centered */}
      <p className="text-sm text-muted-foreground text-center max-w-2xl mx-auto mb-10 leading-relaxed">
        These are some of the trusted sources Teka Muna may reference during the verification
        process. Their inclusion does not imply any official partnership or endorsement.
      </p>

      {/* Groups */}
      <div className="flex flex-col gap-10">
        {TRUSTED_SOURCES.map((group) => (
          <div key={group.group}>
            {/* Group label — centered with flanking lines */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">
                {group.group}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Logos — no box, just the image with hover effects */}
            <div className="flex flex-wrap justify-center gap-6">
              {group.items.map((source) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.name}
                  className="group flex items-center justify-center h-14 w-36 transition-all duration-300"
                >
                  <img
                    src={source.logo}
                    alt={source.alt}
                    className={[
                      "max-h-10 w-auto max-w-full object-contain",
                      // Grayscale by default, full colour on hover
                      "filter grayscale opacity-60",
                      "transition-all duration-300",
                      "group-hover:grayscale-0 group-hover:opacity-100",
                    ].join(" ")}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        ))}
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
      <TrustedSourcesSection />
    </PageContainer>
  );
}
