/**
 * ClaimBanner
 *
 * The "Sinuri na Claim" banner shown above the verdict on ResultPage and
 * CheckPage. Displays a file icon, a small uppercase label, and the claim text.
 *
 * Props:
 *   claim — the claim text to display.
 *   label — the small uppercase label (defaults to "Sinuri na Claim").
 */

import { FileText } from "lucide-react";

export function ClaimBanner({
  claim,
  label = "Sinuri na Claim",
}: {
  claim: string;
  label?: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#d9e4ff] bg-[#f8faff] px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 mt-0.5">
        <FileText className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
          {label}
        </p>
        <p className="text-sm font-bold text-foreground leading-snug break-words">
          {claim}
        </p>
      </div>
    </div>
  );
}
