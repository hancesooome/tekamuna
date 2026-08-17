/**
 * StanceBadge
 *
 * Pill badge showing the stance of a source relative to the claim.
 * Used in ResultPage and CheckPage timeline and source list.
 *
 * Props:
 *   stance — one of "Supports" | "Contradicts" | "Neutral" | "Partially Contradicts"
 */

import { cn } from "@/lib/utils";

export type Stance = "Supports" | "Contradicts" | "Neutral" | "Partially Contradicts";

const STANCE_CLASSES: Record<Stance, string> = {
  Supports:               "bg-emerald-50 text-emerald-700 border-emerald-200",
  Contradicts:            "bg-red-50 text-red-700 border-red-200",
  "Partially Contradicts":"bg-amber-50 text-amber-700 border-amber-200",
  Neutral:                "bg-slate-100 text-slate-600 border-slate-200",
};

export function StanceBadge({ stance }: { stance: Stance }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold", STANCE_CLASSES[stance])}>
      {stance}
    </span>
  );
}
