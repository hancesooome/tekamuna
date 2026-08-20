/**
 * EvidenceTimeline
 *
 * The "Timeline ng Ebidensya" tab body shared by ResultPage and CheckPage.
 * Renders each merged source as a vertical timeline entry with a stance dot,
 * credibility badge, summary, published date, and an external link.
 *
 * Props:
 *   result — the VerifyResult whose sources should be listed.
 */

import { ExternalLink } from "lucide-react";
import type { VerifyResult } from "@/types";
import { getCredibility } from "@/lib/credibility";
import { allSourcesMerged, stanceOf, formatDate } from "@/utils/sources";
import { cn } from "@/lib/utils";
import { stripMarkdown } from "@/utils/stripMarkdown";
import { StanceBadge } from "@/components/shared/StanceBadge";
import { CredBadge } from "@/components/shared/CredBadge";

export function EvidenceTimeline({ result }: { result: VerifyResult }) {
  const allSources = allSourcesMerged(result);

  if (allSources.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-3 text-center">
        <p className="text-sm text-muted-foreground">Walang ebidensya na nakolekta.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {allSources.map((source, i) => {
        const { score } = getCredibility(source.url);
        const stance = stanceOf(source, result);
        return (
          <div key={i} className="flex gap-4">
            {/* Timeline dot */}
            <div className="flex flex-col items-center">
              <div className={cn(
                "h-4 w-4 rounded-full border-2 border-white shadow-sm shrink-0 mt-1",
                stance === "Supports" ? "bg-emerald-400" :
                stance === "Contradicts" ? "bg-red-400" : "bg-primary",
              )} />
              {i < allSources.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>
            {/* Card */}
            <div className="flex-1 rounded-2xl border border-border bg-white p-4 mb-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black text-foreground">{source.sourceName}</span>
                  <CredBadge score={score} />
                </div>
                <StanceBadge stance={stance === "Neutral" ? "Neutral" : stance === "Supports" ? "Supports" : "Contradicts"} />
              </div>
              <p className="text-xs text-foreground leading-relaxed mb-3">{stripMarkdown(source.summary)}</p>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(source.publishedDate)}
                </span>
                <a href={source.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                  Buksan <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
