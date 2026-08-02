/**
 * src/services/shareCardService.ts
 *
 * Generates share-card PNGs (same output as I-download) for upload and social previews.
 */

import html2canvas from "html2canvas";
import { QRCodeSVG } from "qrcode.react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { API_BASE_URL, VERDICT_LABELS } from "@/constants";
import { getPublicUrl } from "@/lib/storageUtils";
import { encodeClaim } from "@/utils/shareUrl";
import type { VerifyResult, Verdict } from "@/types";
import type { PostTemplate, TemplateField, TemplatePlatform } from "@/types/postTemplate";

// ── Verdict themes (mirrors ShareCardButton) ──────────────────────────────────

interface VerdictTheme {
  primary: string;
  secondary: string;
  bg: string;
  text: string;
  border: string;
}

export const VERDICT_THEMES: Record<Verdict, VerdictTheme> = {
  true:       { primary: "#10b981", secondary: "#ecfdf5", bg: "#f0fdf4", text: "#064e3b", border: "#a7f3d0" },
  false:      { primary: "#ef4444", secondary: "#fef2f2", bg: "#fef2f2", text: "#7f1d1d", border: "#fca5a5" },
  misleading: { primary: "#f59e0b", secondary: "#fef8e6", bg: "#fffbeb", text: "#78350f", border: "#fde68a" },
  unverified: { primary: "#94a3b8", secondary: "#f8fafc", bg: "#f8fafc", text: "#0f172a", border: "#cbd5e1" },
};

const DEFAULT_TEMPLATES: Partial<Record<TemplatePlatform, { width: number; height: number; fields: Partial<TemplateField>[] }>> = {
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
};

async function toDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function buildShareUrlForClaim(claim: string): string {
  const encoded = encodeClaim(claim);
  return `${window.location.origin}/check?c=${encoded}`;
}

function fieldText(field: TemplateField, result: VerifyResult): string {
  switch (field.type) {
    case "claim":
      return result.claim;
    case "verdict":
      return VERDICT_LABELS[result.verdict].toUpperCase();
    case "confidence":
      return `${result.confidence}% TIWALA`;
    case "date": {
      const date = new Date(result.verifiedAt);
      return `Sinuri: ${date.toLocaleDateString("fil-PH", { year: "numeric", month: "long", day: "numeric" })}`;
    }
    case "summary":
    case "list":
      return result.explanation;
    case "text":
      return field.staticValue || "";
    case "sources": {
      const mergedSources = result.reliableSources ?? [];
      return mergedSources
        .slice(0, 3)
        .map((s, i) => `${i + 1}. ${s.sourceName || new URL(s.url).hostname}`)
        .join("\n");
    }
    default:
      return "";
  }
}

function resolveBgColor(field: TemplateField): string {
  const base = field.backgroundColor || "transparent";
  if (base === "transparent") return "transparent";
  const pct = field.backgroundOpacity ?? 100;
  if (pct >= 100) return base;
  if (pct <= 0) return "transparent";
  const a = pct / 100;
  const hex = base.replace(/^#/, "");
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return base;
}

async function loadTemplate(platform: TemplatePlatform, result: VerifyResult) {
  const theme = VERDICT_THEMES[result.verdict];
  const res = await fetch(`${API_BASE_URL}/admin/post-templates/active?platform=${platform}&verdict=${result.verdict}`);

  if (res.ok) {
    const t = (await res.json()) as PostTemplate;
    let fields = t.config_json || [];
    const rawBg = t.storage_path ? getPublicUrl(t.storage_path) : null;
    const bgUrl = rawBg ? await toDataUrl(rawBg) : null;
    fields = await Promise.all(fields.map(async (f) => {
      if ((f.type === "image" || f.type === "logo") && f.imageUrl) {
        return { ...f, imageUrl: await toDataUrl(f.imageUrl) };
      }
      return f;
    }));
    return { width: t.canvas_width, height: t.canvas_height, fields, bgUrl };
  }

  const preset = DEFAULT_TEMPLATES[platform];
  if (!preset) throw new Error(`No default template for platform: ${platform}`);

  const fields = preset.fields.map((f, i) => ({
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

  return { width: preset.width, height: preset.height, fields, bgUrl: null as string | null };
}

/** Generate a share-card PNG data URL (same pipeline as I-download). */
export async function generateShareCardPng(
  result: VerifyResult,
  platform: TemplatePlatform = "facebook",
): Promise<string> {
  const theme = VERDICT_THEMES[result.verdict];
  const template = await loadTemplate(platform, result);

  const mount = document.createElement("div");
  mount.style.cssText = "position:fixed;top:-99999px;left:-99999px;pointer-events:none;overflow:visible;";
  document.body.appendChild(mount);

  try {
    const canvasEl = document.createElement("div");
    canvasEl.style.cssText = [
      `width:${template.width}px`,
      `height:${template.height}px`,
      `position:relative`,
      `overflow:hidden`,
      template.bgUrl ? "" : `background-color:${theme.bg}`,
    ].join(";");
    mount.appendChild(canvasEl);

    if (template.bgUrl) {
      const bg = document.createElement("img");
      bg.src = template.bgUrl;
      bg.crossOrigin = "anonymous";
      bg.alt = "";
      bg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:block;";
      canvasEl.appendChild(bg);
    }

    for (const field of template.fields) {
      if (!field.visible) continue;
      const opacity = field.opacity !== undefined ? field.opacity / 100 : 1;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = [
        "position:absolute",
        `left:${field.x}px`,
        `top:${field.y}px`,
        `width:${field.width}px`,
        `min-height:${field.height}px`,
        `z-index:${Math.max(1, field.zIndex)}`,
        `opacity:${opacity}`,
        "overflow:visible",
        field.rotation ? `transform:rotate(${field.rotation}deg)` : "",
        `font-family:${field.fontFamily || "Inter, system-ui, sans-serif"}`,
        `color:${field.color || theme.text}`,
        `background-color:${resolveBgColor(field)}`,
        field.borderRadius ? `border-radius:${field.borderRadius}px` : "",
        field.padding ? `padding:${field.padding}px` : "",
        "display:flex",
        "flex-direction:column",
        "justify-content:center",
        "align-items:stretch",
      ].filter(Boolean).join(";");

      if (field.type === "qr_code") {
        const qrHost = document.createElement("div");
        qrHost.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;";
        wrapper.appendChild(qrHost);
        const root = createRoot(qrHost);
        root.render(
          createElement(QRCodeSVG, {
            value: buildShareUrlForClaim(result.claim),
            size: Math.min(field.width, field.height),
            bgColor: "transparent",
            fgColor: field.color || "#000000",
            level: "H",
          }),
        );
        await new Promise((r) => setTimeout(r, 150));
        root.unmount();
      } else if (field.type === "image" || field.type === "logo") {
        if (field.imageUrl) {
          const img = document.createElement("img");
          img.src = field.imageUrl;
          img.crossOrigin = "anonymous";
          img.alt = field.label;
          img.style.cssText = "width:100%;height:100%;object-fit:" + (field.objectFit ?? "contain") + ";";
          wrapper.appendChild(img);
        }
      } else {
        const span = document.createElement("span");
        span.textContent = fieldText(field, result);
        span.style.cssText = [
          "display:block",
          "width:100%",
          `font-size:${field.fontSize ?? 16}px`,
          `font-weight:${field.fontWeight ?? "400"}`,
          `line-height:${field.lineHeight ?? 1.5}`,
          `text-align:${field.textAlign ?? "left"}`,
          (field.type === "list" || field.type === "sources") ? "white-space:pre-line" : "",
        ].filter(Boolean).join(";");
        wrapper.appendChild(span);
      }

      canvasEl.appendChild(wrapper);
    }

    await new Promise((r) => setTimeout(r, 1000));

    const canvas = await html2canvas(canvasEl, {
      width: template.width,
      height: template.height,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
    });

    return canvas.toDataURL("image/png");
  } finally {
    document.body.removeChild(mount);
  }
}

const uploadInflight = new Map<string, Promise<void>>();

/** Upload a pre-generated PNG data URL for OG previews. */
export async function uploadShareCardPng(result: VerifyResult, dataUrl: string): Promise<void> {
  const key = encodeClaim(result.claim);
  const res = await fetch(`${API_BASE_URL}/og/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ c: key, image: dataUrl }),
  });
  if (!res.ok) {
    console.warn("[OG] Failed to upload share card:", await res.text());
  }
}

/** Upload the Facebook share card so link previews can use it as og:image. */
export async function ensureShareCardUploaded(result: VerifyResult): Promise<void> {
  const key = encodeClaim(result.claim);
  const existing = uploadInflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const dataUrl = await generateShareCardPng(result, "instagram");
    await uploadShareCardPng(result, dataUrl);
  })();

  uploadInflight.set(key, task);
  try {
    await task;
  } finally {
    uploadInflight.delete(key);
  }
}
