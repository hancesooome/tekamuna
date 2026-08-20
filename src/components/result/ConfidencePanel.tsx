/**
 * ConfidencePanel
 *
 * The right-hand "Detection Confidence" panel shared by ResultPage and
 * CheckPage. Renders the animated donut, the sources-analyzed / high-credibility
 * counts, the explanatory disclaimer, and the three derived mini-bars.
 *
 * Previously this markup was duplicated verbatim in both pages. It is now a
 * single component driven purely by a VerifyResult.
 *
 * Props:
 *   result — the VerifyResult to visualise.
 */

import type { VerifyResult } from "@/types";
import { VERDICT_CONFIG } from "@/constants";
import { getCredibility } from "@/lib/credibility";
import { allSourcesMerged } from "@/utils/sources";
import { ConfidenceDonut } from "@/components/shared/ConfidenceDonut";
import {
  deriveConfidenceMetrics,
  DETECTION_CONFIDENCE_LABEL,
} from "./confidenceMetrics";

export function ConfidencePanel({ result }: { result: VerifyResult }) {
  const cfg = VERDICT_CONFIG[result.verdict];
  const allSources = allSourcesMerged(result);
  const credibleCount = allSources.filter((s) => getCredibility(s.url).score >= 70).length;
  const metrics = deriveConfidenceMetrics(result.confidence);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-[#d9e4ff] bg-[#f8faff] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground self-start">
        {DETECTION_CONFIDENCE_LABEL}
      </p>

      {/* On mobile: horizontal layout. On desktop: vertical */}
      <div className="flex flex-row items-center gap-4 w-full sm:flex-col sm:items-center">
        <ConfidenceDonut value={result.confidence} color={cfg.arc} />
        <div className="flex flex-col gap-1 sm:text-center sm:items-center">
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">{allSources.length}</span> sources analyzed
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{credibleCount}</span> high credibility
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/60 pt-2 w-full">
        <strong>{DETECTION_CONFIDENCE_LABEL}</strong> indicates how confidently the claim detector classified the input as a fact-checkable claim based on routing heuristics and pattern matching. It is <strong>not</strong> the AI model's confidence in the truthfulness of the claim or the final verdict.
      </p>

      {/* Mini bars */}
      <div className="w-full space-y-2.5 border-t border-border pt-3">
        {metrics.map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{label}</span><span className="font-bold">{value}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
