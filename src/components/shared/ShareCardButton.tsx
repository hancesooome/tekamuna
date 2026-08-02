/**
 * src/components/shared/ShareCardButton.tsx
 *
 * I-download — generates and previews the share card PNG.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPng } from "@/lib/utils";
import { generateShareCardPng, uploadShareCardPng } from "@/services/shareCardService";
import type { VerifyResult } from "@/types";
import type { TemplatePlatform } from "@/types/postTemplate";

interface ShareCardButtonProps {
  result: VerifyResult;
}

function isIOS(): boolean {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
}

function CardPreviewModal({
  dataUrl,
  filename,
  onClose,
}: {
  dataUrl: string;
  filename: string;
  onClose: () => void;
}) {
  const ios = isIOS();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleDownload() {
    downloadPng(dataUrl, filename);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <p className="font-semibold text-sm">Share Card Preview</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-muted/30 flex items-center justify-center p-3">
          <img
            src={dataUrl}
            alt="Share card preview"
            draggable
            className="block w-full rounded-lg object-contain"
            style={{ maxHeight: "75vh" }}
          />
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 bg-background">
          {ios ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Long-press the image</span> above,
                then tap <span className="font-semibold text-foreground">"Add to Photos"</span> or use the Share menu.
              </p>
              <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
                <X className="h-3.5 w-3.5 mr-1" />Close
              </Button>
            </div>
          ) : saved ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 10 8" className="h-3 w-3 fill-none stroke-white stroke-[2.5]">
                    <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm font-semibold">Na-download na! Check your downloads folder.</span>
              </div>
              <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
                <X className="h-3.5 w-3.5 mr-1" />Close
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-3.5 w-3.5 mr-1.5" />Close
              </Button>
              <Button size="sm" onClick={handleDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />I-download
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ShareCardButton({ result }: ShareCardButtonProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ dataUrl: string; filename: string } | null>(null);

  const triggerExport = async (platform: TemplatePlatform) => {
    setExporting(platform);
    try {
      const dataUrl = await generateShareCardPng(result, platform);
      uploadShareCardPng(result, dataUrl).catch(() => {});
      setPreview({ dataUrl, filename: `teka-muna_${platform}_${result.verdict}.png` });
    } catch (err) {
      console.error("Failed to generate export share card:", err);
      alert("Naging sanhi ng error ang pag-download. Subukan muli.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => triggerExport("instagram")}
        className="text-xs gap-1.5"
        disabled={!!exporting}
      >
        {exporting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Ginagawa...
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            I-download
          </>
        )}
      </Button>

      {preview && (
        <CardPreviewModal
          dataUrl={preview.dataUrl}
          filename={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
