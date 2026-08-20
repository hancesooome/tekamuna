/**
 * VerdictLoadingView + LOADING_STEPS
 *
 * Shared loading UI for the fact-check pipeline. CheckPage renders this as a
 * full-page loader while its mutation is pending. VerifyPage reuses the
 * LOADING_STEPS + useLoadingStep pieces for its inline card overlay.
 *
 * Previously the LOADING_STEPS array and the rotating-step interval logic were
 * duplicated in both CheckPage and VerifyPage.
 */

import { useEffect, useState } from "react";
import { Search, ChevronRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/shared/PageContainer";

/** The rotating status lines shown under the spinner while verifying. */
export const LOADING_STEPS = [
  "Tinatanggap ang claim...",
  "Naghahanap ng mga pinagkukunan...",
  "Sinusuri ang mga ebidensya...",
  "Binubuo ang resulta...",
] as const;

/**
 * Rotates through LOADING_STEPS on a fixed interval and returns the current
 * step string. Encapsulates the setInterval/cleanup boilerplate so callers
 * don't repeat it.
 *
 * @param intervalMs  How long to show each step (default 1200ms).
 */
export function useLoadingStep(intervalMs = 1200): string {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setStepIdx((i) => (i + 1) % LOADING_STEPS.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);
  return LOADING_STEPS[stepIdx];
}

/**
 * Full-page loading view used by CheckPage while the shared-link fact-check
 * runs. Shows a breadcrumb, the claim being checked, and an animated spinner.
 */
export function VerdictLoadingView({ claim }: { claim: string }) {
  const step = useLoadingStep();

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
          <p className="mt-1 text-sm text-muted-foreground animate-pulse">{step}</p>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs text-center">
          Gamit ang pinakabagong web data. Maaaring tumagal ng 5–15 segundo.
        </p>
      </div>
    </PageContainer>
  );
}
