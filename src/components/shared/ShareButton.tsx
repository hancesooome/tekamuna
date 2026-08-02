/**
 * ShareButton — I-share with native sheet on mobile, picker dialog on desktop.
 */

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShareDialog from "@/components/shared/ShareDialog";
import { cn } from "@/lib/utils";
import { prepareShare, shareFactCheck } from "@/utils/share";
import type { VerifyResult } from "@/types";

interface ShareButtonProps {
  result: VerifyResult;
  className?: string;
}

export default function ShareButton({ result, className }: ShareButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      prepareShare(result);
      const outcome = await shareFactCheck(result);
      if (outcome.showDialog) {
        setDialogOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("text-xs gap-1.5", className)}
        disabled={busy}
        onClick={handleClick}
      >
        <Share2 className="h-3.5 w-3.5" />
        {busy ? "Inihahanda..." : "I-share"}
      </Button>

      <ShareDialog
        result={result}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
