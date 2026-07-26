/**
 * VerdictBadge — displays a fact-check verdict pill.
 *
 * Variants match the four possible verdicts:
 *   true        → green  "✓ Totoo"
 *   false       → red    "✗ Hindi Totoo"
 *   misleading  → amber  "⚠ Mapanlinlang"
 *   unverified  → slate  "? Hindi Ma-verify"
 */

import { CheckCircle, XCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type Verdict = "true" | "false" | "misleading" | "unverified";

interface VerdictBadgeProps {
  verdict: Verdict;
  className?: string;
  /** Show confidence percentage below the badge */
  confidence?: number;
  /** Compact size for list rows */
  size?: "sm" | "md";
}

const CONFIG: Record<
  Verdict,
  { label: string; Icon: React.ElementType; pill: string; iconClass: string }
> = {
  true: {
    label: "Totoo",
    Icon: CheckCircle,
    pill: "bg-emerald-50 border border-emerald-200 text-emerald-700",
    iconClass: "text-emerald-500",
  },
  false: {
    label: "Hindi Totoo",
    Icon: XCircle,
    pill: "bg-red-50 border border-red-200 text-red-700",
    iconClass: "text-red-500",
  },
  misleading: {
    label: "Mapanlinlang",
    Icon: AlertTriangle,
    pill: "bg-amber-50 border border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
  },
  unverified: {
    label: "Hindi Ma-verify",
    Icon: HelpCircle,
    pill: "bg-slate-100 border border-slate-200 text-slate-600",
    iconClass: "text-slate-400",
  },
};

export function VerdictBadge({
  verdict,
  confidence,
  size = "md",
  className,
}: VerdictBadgeProps) {
  const { label, Icon, pill, iconClass } = CONFIG[verdict];

  return (
    <div className={cn("flex flex-col items-end gap-0.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-bold",
          pill,
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs",
        )}
      >
        <Icon className={cn(iconClass, size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
        {label}
      </span>
      {confidence !== undefined && (
        <span className="text-[10px] text-muted-foreground font-medium">
          {confidence}% confident
        </span>
      )}
    </div>
  );
}
