/**
 * src/components/shared/ShareCardButton.tsx
 *
 * A premium action button on the Verification Result page.
 * Displays a custom click-away dropdown menu to export the result card in various social formats:
 *   - Facebook Card (1200 × 630 px)
 *   - Instagram Square (1080 × 1080 px)
 *   - Story (1080 × 1920 px)
 *
 * Redesigned to perfectly match the public interface theme.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPng } from "@/lib/utils";
import { API_BASE_URL, VERDICT_LABELS } from "@/constants";
import { getPublicUrl } from "@/lib/storageUtils";
import { buildShareUrl } from "@/utils/shareUrl";
import type { VerifyResult, Verdict } from "@/types";
import type { PostTemplate, TemplateField, TemplatePlatform } from "@/types/postTemplate";
import html2canvas from "html2canvas";
import { QRCodeSVG } from "qrcode.react";

interface ShareCardButtonProps {
  result: VerifyResult;
}

// ── Default styling tokens based on Verdict ───────────────────────────────────

interface VerdictTheme {
  primary:   string;
  secondary: string;
  bg:        string;
  text:      string;
  border:    string;
}

const VERDICT_THEMES: Record<Verdict, VerdictTheme> = {
  true: {
    primary:   "#10b981", // Emerald
    secondary: "#ecfdf5",
    bg:        "#f0fdf4",
    text:      "#064e3b",
    border:    "#a7f3d0",
  },
  false: {
    primary:   "#ef4444", // Red
    secondary: "#fef2f2",
    bg:        "#fef2f2",
    text:      "#7f1d1d",
    border:    "#fca5a5",
  },
  misleading: {
    primary:   "#f59e0b", // Amber
    secondary: "#fef8e6",
    bg:        "#fffbeb",
    text:      "#78350f",
    border:    "#fde68a",
  },
  unverified: {
    primary:   "#94a3b8", // Slate
    secondary: "#f8fafc",
    bg:        "#f8fafc",
    text:      "#0f172a",
    border:    "#cbd5e1",
  },
};

const DEFAULT_TEMPLATES: Record<TemplatePlatform, { width: number; height: number; fields: Partial<TemplateField>[] }> = {
  facebook: {
    width: 1200,
    height: 630,
    fields: [
      { id: "claim", type: "claim", x: 60, y: 150, width: 680, height: 160, fontSize: 28, fontWeight: "700", color: "#0f172a", textAlign: "left", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 14, padding: 20 },
      { id: "verdict", type: "verdict", x: 60, y: 60, width: 220, height: 58, fontSize: 24, fontWeight: "900", color: "#ffffff", textAlign: "center", borderRadius: 29, padding: 8 },
      { id: "confidence", type: "confidence", x: 300, y: 66, width: 160, height: 46, fontSize: 16, fontWeight: "700", textAlign: "center", borderRadius: 10, padding: 8 },
      { id: "date", type: "date", x: 60, y: 330, width: 400, height: 36, fontSize: 14, fontWeight: "500", color: "#475569", textAlign: "left" },
      { id: "summary", type: "summary", x: 60, y: 390, width: 680, height: 180, fontSize: 16, fontWeight: "400", color: "#1e293b", textAlign: "left", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 14, padding: 18, lineHeight: 1.6 },
      { id: "qr_code", type: "qr_code", x: 800, y: 150, width: 340, height: 340, backgroundColor: "#ffffff", borderRadius: 18, padding: 20 },
      { id: "scan_text", type: "text", x: 800, y: 510, width: 340, height: 40, fontSize: 15, fontWeight: "700", color: "#ffffff", textAlign: "center", staticValue: "I-scan para basahin ang buong ulat" },
      { id: "brand_logo", type: "text", x: 920, y: 66, width: 220, height: 50, fontSize: 24, fontWeight: "900", color: "#ffffff", textAlign: "right", staticValue: "TEKA MUNA" },
    ],
  },
  instagram: {
    width: 1080,
    height: 1080,
    fields: [
      { id: "brand_logo", type: "text", x: 50, y: 50, width: 980, height: 40, fontSize: 20, fontWeight: "900", color: "#ffffff", textAlign: "center", staticValue: "TEKA MUNA FACT CHECK" },
      { id: "verdict", type: "verdict", x: 50, y: 120, width: 320, height: 64, fontSize: 26, fontWeight: "900", color: "#ffffff", textAlign: "center", borderRadius: 32, padding: 10 },
      { id: "confidence", type: "confidence", x: 390, y: 128, width: 180, height: 48, fontSize: 16, fontWeight: "700", textAlign: "center", borderRadius: 10, padding: 8 },
      { id: "claim", type: "claim", x: 50, y: 220, width: 980, height: 200, fontSize: 26, fontWeight: "700", color: "#0f172a", textAlign: "left", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 16, padding: 24 },
      { id: "summary", type: "summary", x: 50, y: 450, width: 980, height: 260, fontSize: 16, fontWeight: "400", color: "#1e293b", textAlign: "left", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 16, padding: 22, lineHeight: 1.6 },
      { id: "qr_code", type: "qr_code", x: 50, y: 760, width: 240, height: 240, backgroundColor: "#ffffff", borderRadius: 14, padding: 14 },
      { id: "scan_text", type: "text", x: 320, y: 830, width: 710, height: 80, fontSize: 18, fontWeight: "700", color: "#ffffff", textAlign: "left", staticValue: "I-scan ang QR Code para sa buong detalye ng pagsusuri." },
      { id: "date", type: "date", x: 320, y: 920, width: 710, height: 30, fontSize: 14, fontWeight: "500", color: "#94a3b8", textAlign: "left" },
    ],
  },
  story: {
    width: 1080,
    height: 1920,
    fields: [
      { id: "brand_logo", type: "text", x: 60, y: 80, width: 960, height: 50, fontSize: 24, fontWeight: "900", color: "#ffffff", textAlign: "center", staticValue: "TEKA MUNA" },
      { id: "verdict", type: "verdict", x: 60, y: 180, width: 380, height: 72, fontSize: 28, fontWeight: "900", color: "#ffffff", textAlign: "center", borderRadius: 36, padding: 12 },
      { id: "confidence", type: "confidence", x: 470, y: 192, width: 200, height: 50, fontSize: 16, fontWeight: "700", textAlign: "center", borderRadius: 10, padding: 8 },
      { id: "claim", type: "claim", x: 60, y: 290, width: 960, height: 320, fontSize: 28, fontWeight: "700", color: "#0f172a", textAlign: "left", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 20, padding: 28 },
      { id: "summary", type: "summary", x: 60, y: 650, width: 960, height: 460, fontSize: 18, fontWeight: "400", color: "#1e293b", textAlign: "left", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 20, padding: 28, lineHeight: 1.6 },
      { id: "qr_code", type: "qr_code", x: 360, y: 1220, width: 360, height: 360, backgroundColor: "#ffffff", borderRadius: 24, padding: 22 },
      { id: "scan_text", type: "text", x: 60, y: 1620, width: 960, height: 40, fontSize: 18, fontWeight: "700", color: "#ffffff", textAlign: "center", staticValue: "I-scan para basahin ang buong ulat" },
      { id: "date", type: "date", x: 60, y: 1720, width: 960, height: 40, fontSize: 14, fontWeight: "500", color: "#94a3b8", textAlign: "center" },
    ],
  },
};

// ── Rendering helper inside the hidden canvas ─────────────────────────────────

function RenderCanvasField({ field, result }: { field: TemplateField; result: VerifyResult; theme?: VerdictTheme }) {
  if (field.type === "image" || field.type === "logo") {
    return field.imageUrl ? (
      <img
        src={field.imageUrl}
        alt={field.label}
        crossOrigin="anonymous"
        className="w-full h-full pointer-events-none"
        style={{ objectFit: field.objectFit ?? "contain" }}
      />
    ) : null;
  }

  if (field.type === "qr_code") {
    const url = buildShareUrl(result.claim);
    return (
      <div className="w-full h-full flex items-center justify-center">
        <QRCodeSVG
          value={url}
          size={Math.min(field.width, field.height)}
          bgColor="transparent"
          fgColor={field.color || "#000000"}
          level="H"
          className="w-full h-full object-contain pointer-events-none"
        />
      </div>
    );
  }

  let text = "";
  switch (field.type) {
    case "claim":
      text = result.claim;
      break;
    case "verdict":
      text = VERDICT_LABELS[result.verdict].toUpperCase();
      break;
    case "confidence":
      text = `${result.confidence}% TIWALA`;
      break;
    case "date":
      const date = new Date(result.verifiedAt);
      text = `Sinuri: ${date.toLocaleDateString("fil-PH", { year: "numeric", month: "long", day: "numeric" })}`;
      break;
    case "summary":
      text = result.explanation;
      break;
    case "text":
      text = field.staticValue || "";
      break;
    case "list":
      text = result.explanation;
      break;
    case "sources": {
      const mergedSources = result.reliableSources ?? [];
      text = mergedSources
        .slice(0, 3)
        .map((s, i) => `${i + 1}. ${s.sourceName || new URL(s.url).hostname}`)
        .join("\n");
      break;
    }
    default:
      text = "";
  }

  return (
    <span
      className="block select-none pointer-events-none"
      style={{
        width:           "100%",
        fontSize:        `${field.fontSize ?? 16}px`,
        fontWeight:      field.fontWeight ?? "400",
        lineHeight:      field.lineHeight ?? 1.5,
        textAlign:       field.textAlign ?? "left",
        whiteSpace:      (field.type === "list" || field.type === "sources") ? "pre-line" : "normal",
        ...(field.maxLines
          ? {
              display:         "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: field.maxLines,
              overflow:        "hidden",
            }
          : {
              display:  "block",
              overflow: "visible",
            }),
      }}
    >
      {text}
    </span>
  );
}

/**
 * Fetch an image URL and return a base64 data URL.
 * This bypasses CORS canvas-taint issues in production — a data: URL
 * is treated as same-origin so the canvas never becomes tainted.
 * Falls back to the original URL if the fetch fails (e.g. in dev).
 */
async function toDataUrl(url: string): Promise<string> {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // fallback — may still work if server sends CORS headers
  }
}

// ── iOS detection ─────────────────────────────────────────────────────────────

function isIOS(): boolean {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────
// Receives the already-generated dataUrl — no re-generation happens here.

function CardPreviewModal({
  dataUrl,
  filename,
  onClose,
}: {
  dataUrl:  string;
  filename: string;
  onClose:  () => void;
}) {
  const ios = isIOS();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleDownload() {
    downloadPng(dataUrl, filename);
  }

  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card — sizes to content, not the viewport */}
      <div
        className="bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <p className="font-semibold text-sm">Share Card Preview</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image — constrained height so portrait cards don't fill the screen */}
        <div className="bg-muted/30 flex items-center justify-center p-3">
          <img
            src={dataUrl}
            alt="Share card preview"
            draggable
            className="block w-full rounded-lg object-contain"
            style={{ maxHeight: "75vh" }}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-4 py-3 bg-background">
          {ios ? (
            /* iOS Safari: programmatic download is blocked.
               Show the image above so the user can long-press → Save to Photos. */
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Long-press the image</span> above,
                then tap <span className="font-semibold text-foreground">"Add to Photos"</span> or use the Share menu.
              </p>
              <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
                <X className="h-3.5 w-3.5 mr-1" />Close
              </Button>
            </div>
          ) : (
            /* Desktop / Android: standard download */
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
    document.body
  );
}

export default function ShareCardButton({ result }: ShareCardButtonProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ dataUrl: string; filename: string } | null>(null);
  const dropdownRef               = useRef<HTMLDivElement>(null);
  const hiddenCanvasRef           = useRef<HTMLDivElement>(null);
  const [activeTemplate, setActiveTemplate] = useState<{
    width: number;
    height: number;
    fields: TemplateField[];
    bgUrl: string | null;
  } | null>(null);

  const theme = VERDICT_THEMES[result.verdict];

  // Click away to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [dropdownOpen]);

  const triggerExport = async (platform: TemplatePlatform) => {
    setDropdownOpen(false);
    setExporting(platform);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/post-templates/active?platform=${platform}&verdict=${result.verdict}`);
      let width = 0;
      let height = 0;
      let fields: TemplateField[] = [];
      let bgUrl: string | null = null;

      if (res.ok) {
        const t = (await res.json()) as PostTemplate;
        width  = t.canvas_width;
        height = t.canvas_height;
        fields = t.config_json || [];
        // Convert storage URL → data URL to avoid CORS canvas taint in production
        const rawBg = t.storage_path ? getPublicUrl(t.storage_path) : null;
        bgUrl = rawBg ? await toDataUrl(rawBg) : null;
        // Also convert any image/logo fields to data URLs
        fields = await Promise.all(fields.map(async (f) => {
          if ((f.type === "image" || f.type === "logo") && f.imageUrl) {
            return { ...f, imageUrl: await toDataUrl(f.imageUrl) };
          }
          return f;
        }));
      } else {
        const preset = DEFAULT_TEMPLATES[platform];
        width = preset.width;
        height = preset.height;
        bgUrl = null;
        fields = preset.fields.map((f, i) => ({
          id: f.id || `f_${i}`,
          type: f.type || "text",
          label: f.label || "Field",
          x: f.x || 0,
          y: f.y || 0,
          width: f.width || 200,
          height: f.height || 50,
          visible: true,
          zIndex: i + 1,
          color: f.type === "verdict" ? "#ffffff" : f.type === "confidence" ? theme.primary : f.color || "#0f172a",
          backgroundColor: f.type === "verdict" ? theme.primary : f.type === "confidence" ? theme.secondary : f.backgroundColor || "transparent",
          ...f,
        })) as TemplateField[];
      }

      setActiveTemplate({ width, height, fields, bgUrl });

      // Wait for React to render the hidden canvas and for images to load.
      // 1000ms for production CDN latency — localhost is faster but this is safe for both.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!hiddenCanvasRef.current) {
        throw new Error("Offscreen canvas not rendered in DOM.");
      }

      const canvas = await html2canvas(hiddenCanvasRef.current, {
        width,
        height,
        scale:           1,
        useCORS:         true,   // fetch cross-origin images with CORS headers
        allowTaint:      false,  // don't allow tainted canvas — fail cleanly instead
        backgroundColor: null,   // preserve transparency
        logging:         false,
      });
      const dataUrl = canvas.toDataURL("image/png");

      // Open preview modal — user downloads from inside it.
      // This works on all platforms including iOS Safari.
      setPreview({ dataUrl, filename: `teka-muna_${platform}_${result.verdict}.png` });
    } catch (err) {
      console.error("Failed to generate export share card:", err);
      alert("Naging sanhi ng error ang pag-download. Subukan muli.");
    } finally {
      setActiveTemplate(null);
      setExporting(null);
    }
  };

  return (
    <>
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDropdownOpen(o => !o)}
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
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </>
        )}
      </Button>

      {dropdownOpen && (
        <div className="absolute left-0 mt-1.5 w-60 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            type="button"
            onClick={() => triggerExport("instagram")}
            className="w-full text-left text-xs py-2.5 px-3.5 hover:bg-muted/70 flex items-center justify-between border-b border-border/40 transition-colors cursor-pointer"
          >
            <span className="font-semibold">FB / IG Square Photo</span>
            {exporting === "instagram" ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <span className="text-[10px] font-mono opacity-50">1080&times;1080</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => triggerExport("story")}
            className="w-full text-left text-xs py-2.5 px-3.5 hover:bg-muted/70 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span className="font-semibold">Story Portrait</span>
            {exporting === "story" ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <span className="text-[10px] font-mono opacity-50">1080&times;1920</span>
            )}
          </button>
        </div>
      )}

      {/* ── Offscreen Rendering Canvas Container ── */}
      {/* Positioned off-screen (not hidden/opacity:0/z:-1) so Safari paints it. */}
      {/* zIndex:-1 or opacity:0 on Safari causes html-to-image to get blank canvas. */}
      {activeTemplate && (
        <div
          style={{
            position:      "fixed",
            top:           "-99999px",
            left:          "-99999px",
            pointerEvents: "none",
            overflow:      "visible",
          }}
        >
          <div
            ref={hiddenCanvasRef}
            style={{
              width:           activeTemplate.width,
              height:          activeTemplate.height,
              backgroundColor: activeTemplate.bgUrl ? undefined : theme.bg,
              position:        "relative",
              overflow:        "hidden",
            }}
          >
            {/* Background rendered as <img> so html-to-image captures it correctly.  */}
            {/* CSS background-image is NOT captured by html-to-image on Safari/production. */}
            {activeTemplate.bgUrl && (
              <img
                src={activeTemplate.bgUrl}
                alt=""
                crossOrigin="anonymous"
                style={{
                  position:   "absolute",
                  inset:      0,
                  width:      "100%",
                  height:     "100%",
                  objectFit:  "cover",
                  zIndex:     0,
                  display:    "block",
                }}
              />
            )}
            {activeTemplate.fields.map((field) => {
              if (!field.visible) return null;
              const opacity = field.opacity !== undefined ? field.opacity / 100 : 1;
              // Apply backgroundOpacity separately so text stays visible when box is faded
              const bgColor = (() => {
                const base = field.backgroundColor || "transparent";
                if (base === "transparent") return "transparent";
                const pct = field.backgroundOpacity ?? 100;
                if (pct >= 100) return base;
                if (pct <= 0)   return "transparent";
                const a = pct / 100;
                const hex = base.replace(/^#/, "");
                if (hex.length === 6) {
                  const r = parseInt(hex.slice(0, 2), 16);
                  const g = parseInt(hex.slice(2, 4), 16);
                  const b = parseInt(hex.slice(4, 6), 16);
                  return `rgba(${r},${g},${b},${a})`;
                }
                return base;
              })();

              return (
                <div
                  key={field.id}
                  style={{
                    position:        "absolute",
                    left:            field.x,
                    top:             field.y,
                    width:           field.width,
                    minHeight:       field.height,
                    zIndex:          Math.max(1, field.zIndex),
                    opacity,
                    overflow:        "visible",
                    transform:       field.rotation ? `rotate(${field.rotation}deg)` : undefined,
                    fontFamily:      field.fontFamily || "Inter, system-ui, sans-serif",
                    color:           field.color || theme.text,
                    backgroundColor: bgColor,
                    borderRadius:    field.borderRadius ? `${field.borderRadius}px` : undefined,
                    padding:         field.padding ? `${field.padding}px` : undefined,
                    display:         "flex",
                    flexDirection:   "column",
                    justifyContent:  "center",
                    alignItems:      "stretch",
                  }}
                >
                  <RenderCanvasField field={field} result={result} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
