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

import React, { useState, useRef, useEffect } from "react";
import { Download, Loader2, Image, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, VERDICT_LABELS } from "@/constants";
import { getPublicUrl } from "@/lib/storageUtils";
import { buildShareUrl } from "@/utils/shareUrl";
import type { VerifyResult, Verdict } from "@/types";
import type { PostTemplate, TemplateField, TemplatePlatform } from "@/types/postTemplate";
import { toPng } from "html-to-image";
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

function RenderCanvasField({ field, result, theme }: { field: TemplateField; result: VerifyResult; theme: VerdictTheme }) {
  if (field.type === "image" || field.type === "logo") {
    return field.imageUrl ? (
      <img
        src={field.imageUrl}
        alt={field.label}
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
    case "sources":
      const mergedSources = [
        ...(result.primarySources || []),
        ...(result.supportingSources || []),
      ];
      text = mergedSources
        .slice(0, 3)
        .map((s, i) => `${i + 1}. ${s.siteName || new URL(s.url).hostname}`)
        .join("\n");
      break;
    default:
      text = "";
  }

  return (
    <span
      className="block select-none pointer-events-none overflow-hidden"
      style={{
        fontSize:        `${field.fontSize ?? 16}px`,
        fontWeight:      field.fontWeight ?? "400",
        lineHeight:      field.lineHeight ?? 1.4,
        textAlign:       field.textAlign ?? "left",
        display:         "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: field.maxLines ?? "unset",
        whiteSpace:      (field.type === "list" || field.type === "sources") ? "pre-line" : "normal",
      }}
    >
      {text}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ShareCardButton({ result }: ShareCardButtonProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
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
        width = t.canvas_width;
        height = t.canvas_height;
        fields = t.config_json || [];
        bgUrl = t.storage_path ? getPublicUrl(t.storage_path) : null;
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

      await new Promise((resolve) => setTimeout(resolve, 350));

      if (!hiddenCanvasRef.current) {
        throw new Error("Offscreen canvas not rendered in DOM.");
      }

      const dataUrl = await toPng(hiddenCanvasRef.current, {
        width,
        height,
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      });

      const link = document.createElement("a");
      link.download = `teka-muna_${platform}_${result.verdict}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate export share card:", err);
      alert("Naging sanhi ng error ang pag-download. Subukan muli.");
    } finally {
      setActiveTemplate(null);
      setExporting(null);
    }
  };

  return (
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

      {/* ── Offscreen Rendering Canvas Container (Moved out of bounds) ── */}
      {activeTemplate && (
        <div className="fixed top-[-9999px] left-[-9999px] z-[-50] overflow-hidden pointer-events-none">
          <div
            ref={hiddenCanvasRef}
            style={{
              width:              activeTemplate.width,
              height:             activeTemplate.height,
              backgroundImage:    activeTemplate.bgUrl ? `url(${activeTemplate.bgUrl})` : "none",
              backgroundSize:     "cover",
              backgroundPosition: "center",
              backgroundColor:    activeTemplate.bgUrl ? undefined : theme.bg,
              position:           "relative",
            }}
          >
            {activeTemplate.fields.map((field) => {
              if (!field.visible) return null;
              const opacity = field.opacity !== undefined ? field.opacity / 100 : 1;

              return (
                <div
                  key={field.id}
                  style={{
                    position:        "absolute",
                    left:            field.x,
                    top:             field.y,
                    width:           field.width,
                    height:          field.height,
                    zIndex:          field.zIndex,
                    opacity,
                    transform:       field.rotation ? `rotate(${field.rotation}deg)` : undefined,
                    fontFamily:      field.fontFamily || "Inter, system-ui, sans-serif",
                    color:           field.color || theme.text,
                    backgroundColor: field.backgroundColor || "transparent",
                    borderRadius:    field.borderRadius ? `${field.borderRadius}px` : undefined,
                    padding:         field.padding ? `${field.padding}px` : undefined,
                    display:         "flex",
                    flexDirection:   "column",
                    justifyContent:  "center",
                  }}
                >
                  <RenderCanvasField field={field} result={result} theme={theme} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
