/**
 * SourceList
 *
 * The "Mga Source" tab body shared by ResultPage and CheckPage.
 * Renders all merged sources as a credibility-sorted list, each row showing a
 * score circle, title/name, and a stance badge.
 *
 * Props:
 *   result — the VerifyResult whose sources should be listed.
 */

import type { VerifyResult } from "@/types";
import { getCredibility, scoreColor, scoreBg } from "@/lib/credibility";
import { allSourcesMerged, stanceOf } from "@/utils/sources";
import { cn } from "@/lib/utils";
import { StanceBadge } from "@/components/shared/StanceBadge";

export function SourceList({ result }: { result: VerifyResult }) {
  const allSources = allSourcesMerged(result);

  return (
    <div className="rounded-2xl border border-[#d9e4ff] bg-white/55 overflow-hidden">
      {allSources
        .map((s) => ({ source: s, cred: getCredibility(s.url), stance: stanceOf(s, result) }))
        .sort((a, b) => b.cred.score - a.cred.score)
        .map(({ source, cred, stance }, i) => (
          <div key={i}
            className={cn("flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
              i > 0 && "border-t border-border")}>
            {/* Score circle */}
            <div className={cn(
              "h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-xs font-black",
              scoreBg(cred.score), scoreColor(cred.score),
            )}>
              {cred.score}
            </div>
            {/* Name + domain */}
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-foreground leading-snug line-clamp-2">{source.title || source.sourceName}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{source.sourceName}</p>
            </div>
            {/* Stance — always visible */}
            <div className="shrink-0">
              <StanceBadge stance={stance === "Neutral" ? "Neutral" : stance === "Supports" ? "Supports" : "Contradicts"} />
            </div>
          </div>
        ))}
    </div>
  );
}
