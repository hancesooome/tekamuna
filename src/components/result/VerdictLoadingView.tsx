/** Shared progress UI for the fact-check pipeline. */

import { useEffect, useState } from "react";
import { Search, ChevronRight, FileText, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/shared/PageContainer";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const LOADING_STEPS = [
  "Tinatanggap ang claim",
  "Naghahanap ng mga mapagkakatiwalaang source",
  "Sinusuri ang mga ebidensya",
  "Binubuo ang verdict",
] as const;

interface LoadingProgressState {
  elapsedSeconds: number;
  progress: number;
  stepIndex: number;
}

/** Estimated progress that stops at 92% until the one-shot API response arrives. */
export function useLoadingProgress(): LoadingProgressState {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const progress = Math.min(92, Math.round(8 + 84 * (1 - Math.exp(-elapsedMs / 9_000))));
  const stepIndex = elapsedMs < 1_500 ? 0 : elapsedMs < 5_000 ? 1 : elapsedMs < 12_000 ? 2 : 3;
  return { elapsedSeconds, progress, stepIndex };
}

export function VerdictProgress({ compact = false }: { compact?: boolean }) {
  const { elapsedSeconds, progress, stepIndex } = useLoadingProgress();
  const waitMessage = elapsedSeconds < 30
    ? "Karaniwang natatapos sa loob ng 10–30 segundo."
    : "Mas matagal kaysa karaniwan, pero patuloy pa rin ang pagsusuri.";

  return (
    <div className={cn("w-full", compact ? "max-w-md px-6" : "max-w-xl")} aria-live="polite">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-black text-foreground">Sinusuri ang claim</p>
            <span className="text-xs font-bold tabular-nums text-primary">{progress}%</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{LOADING_STEPS[stepIndex]}…</p>
        </div>
      </div>

      <Progress value={progress} aria-label={`Tinatayang progreso: ${progress}%`} className="h-3 bg-primary/10" />

      {!compact && (
        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Mga hakbang ng pagsusuri">
          {LOADING_STEPS.map((label, index) => (
            <li key={label} className="text-center">
              <div className={cn(
                "mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black transition-colors",
                index < stepIndex && "border-primary bg-primary text-primary-foreground",
                index === stepIndex && "border-primary bg-primary/10 text-primary",
                index > stepIndex && "border-border bg-background text-muted-foreground",
              )}>
                {index < stepIndex ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span className={cn(
                "hidden text-[10px] leading-tight sm:block",
                index === stepIndex ? "font-bold text-foreground" : "text-muted-foreground",
              )}>{label}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{waitMessage}</span>
        <span className="shrink-0 tabular-nums">{elapsedSeconds}s</span>
      </div>
    </div>
  );
}

export function VerdictLoadingView({ claim }: { claim: string }) {
  return (
    <PageContainer className="max-w-[850px] pb-12">
      <nav className="flex items-center gap-1.5 pt-8 pb-6 text-sm text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-foreground">Shared Check</span>
      </nav>

      <div className="mb-8 flex items-center gap-3 rounded-xl border border-[#d9e4ff] bg-[#f8faff] px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sinusuring claim</p>
          <p className="text-sm font-bold leading-snug text-foreground">{claim}</p>
        </div>
      </div>

      <div className="flex justify-center rounded-2xl border border-border bg-white px-6 py-12 shadow-sm sm:px-10 sm:py-16">
        <VerdictProgress />
      </div>
    </PageContainer>
  );
}
