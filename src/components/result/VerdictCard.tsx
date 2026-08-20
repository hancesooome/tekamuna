/**
 * VerdictCard
 *
 * The left-hand verdict card shared by ResultPage and CheckPage. Renders the
 * verdict icon, label, and explanation, followed by a slot for page-specific
 * action buttons and an optional footer (e.g. the feedback row on ResultPage).
 *
 * Props:
 *   result   — the VerifyResult to display.
 *   titleId  — id for the "AI Verdict" heading (pages use distinct ids for a11y).
 *   actions  — page-specific action buttons (share, compare, etc.).
 *   footer   — optional extra content rendered below the actions.
 */

import type { ReactNode } from "react";
import type { VerifyResult } from "@/types";
import { VERDICT_LABELS, VERDICT_CONFIG } from "@/constants";
import { cn } from "@/lib/utils";
import { stripMarkdown } from "@/utils/stripMarkdown";

interface VerdictCardProps {
  result: VerifyResult;
  titleId: string;
  actions: ReactNode;
  footer?: ReactNode;
}

export function VerdictCard({ result, titleId, actions, footer }: VerdictCardProps) {
  const cfg = VERDICT_CONFIG[result.verdict];
  const { Icon } = cfg;
  const label = VERDICT_LABELS[result.verdict];

  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex flex-col gap-4 rounded-xl border-2 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.07)] sm:p-6", cfg.bg, cfg.border)}
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm", cfg.iconBg)}>
          <Icon className="h-7 w-7 text-white" />
        </div>
        <div>
          <p id={titleId} className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-primary">
            Hatol ng AI
          </p>
          <p className={cn("text-3xl font-black leading-tight mt-0.5", cfg.label)}>
            {label}
          </p>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-sm text-foreground leading-relaxed">{stripMarkdown(result.explanation)}</p>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {actions}
      </div>

      {footer}
    </section>
  );
}
