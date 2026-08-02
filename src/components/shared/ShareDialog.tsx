/**
 * ShareDialog — desktop share picker with platform shortcuts.
 */

import { useState } from "react";
import { Check, Copy, Link2, MessageCircle, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildSharePayload,
  copyShareLink,
  openPlatformShare,
  type SharePlatform,
} from "@/utils/share";
import { ensureShareCardUploaded } from "@/services/shareCardService";
import type { VerifyResult } from "@/types";

interface ShareDialogProps {
  result: VerifyResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLATFORMS: {
  id: SharePlatform;
  label: string;
  color: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "facebook",
    label: "Facebook",
    color: "bg-[#1877F2] hover:bg-[#166fe0]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: "messenger",
    label: "Messenger",
    color: "bg-[#0084FF] hover:bg-[#0073e6]",
    icon: <MessageCircle className="h-6 w-6 text-white" strokeWidth={2} />,
  },
  {
    id: "x",
    label: "X",
    color: "bg-neutral-900 hover:bg-neutral-700",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "bg-[#25D366] hover:bg-[#20bd5a]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "bg-[#26A5E4] hover:bg-[#1f97d4]",
    icon: <Send className="h-6 w-6 text-white" strokeWidth={2} />,
  },
];

export default function ShareDialog({ result, open, onOpenChange }: ShareDialogProps) {
  const payload = buildSharePayload(result);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleCopy() {
    const ok = await copyShareLink(payload.url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  async function handlePlatform(platform: SharePlatform) {
    // For Facebook: ensure the share card PNG is uploaded first so the
    // og:image is ready when FB's crawler hits the /check?c= URL.
    if (platform === "facebook" || platform === "messenger") {
      setUploading(true);
      try {
        await ensureShareCardUploaded(result);
      } catch {
        // Upload failed — open sharer anyway, FB will use the fallback SVG
      } finally {
        setUploading(false);
      }
    }
    openPlatformShare(platform, payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100%-2rem)] gap-0 p-0 [grid-template-columns:minmax(0,1fr)]">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 pr-6 text-base">
            <Link2 className="h-4 w-4 text-primary shrink-0" />
            I-share ang resulta
          </DialogTitle>
          <DialogDescription className="text-left line-clamp-2 pt-0.5 text-xs">
            {payload.text}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Copy link row */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2 pl-3 min-w-0">
            <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate font-mono">
              {payload.url}
            </p>
            <Button
              size="sm"
              variant={copied ? "default" : "secondary"}
              className={cn(
                "shrink-0 gap-1 text-xs h-7 px-2.5 whitespace-nowrap",
                copied && "bg-emerald-600 hover:bg-emerald-600",
              )}
              onClick={handleCopy}
            >
              {copied ? (
                <><Check className="h-3 w-3" /> Na-copy!</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy</>
              )}
            </Button>
          </div>

          {/* Platform circles — flex wrap, always fits */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
              I-share sa
            </p>
            <div className="flex flex-wrap justify-around gap-y-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePlatform(p.id)}
                  disabled={uploading}
                  className="flex flex-col items-center gap-1.5 group disabled:opacity-60 disabled:cursor-wait"
                >
                  <span
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-transform",
                      "group-hover:scale-110 group-active:scale-95",
                      p.color,
                    )}
                  >
                    {p.icon}
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground leading-none">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
            {uploading && (
              <p className="text-center text-[10px] text-muted-foreground animate-pulse">
                Inihahanda ang preview…
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
