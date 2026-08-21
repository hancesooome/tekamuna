/**
 * src/components/template-editor/TemplateEditor.tsx
 *
 * Full-screen drag-and-drop template editor.
 * Phase 10 — Polish: Adds toolbar features including Snap to Grid, Undo/Redo,
 * Zooming, Lock/Unlock, Duplication, Z-Index layers (front/back), alignment guides,
 * and comprehensive keyboard shortcuts.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Trash2, Save, Move, Eye, EyeOff, Type, Layout, Image as ImageIcon, Link, QrCode, Star, BarChart2, Calendar, List, AlignLeft, ChevronDown, ChevronRight,
  FileText, Download, Lock, Unlock, Copy, ZoomIn, ZoomOut, RotateCcw, Undo2, Redo2,
  ChevronUp, ChevronDown as ChevronDownIcon, CopyCheck, X, Check, Loader2 as Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/constants";
import { getPublicUrl } from "@/lib/storageUtils";
import type { PostTemplate, TemplateField, FieldType } from "@/types/postTemplate";
import { downloadPng } from "@/lib/utils";
import { toPng } from "html-to-image";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchFieldDefaults,
  persistFieldDefaults,
  type FieldDefaultsMap,
} from "./fieldDefaults";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateEditorProps {
  template: PostTemplate;
  onBack: () => void;
  onSaveSuccess: () => void;
  token: string | null;
}

// ── Field catalogue ───────────────────────────────────────────────────────────

interface FieldDef {
  label:    string;
  icon:     React.ReactNode;
  category: "dynamic" | "static";
  preview:  string;
  accent:   string;
  defaults: Partial<TemplateField>;
}

const FIELD_CATALOGUE: Record<FieldType, FieldDef> = {
  claim: {
    label: "Claim", icon: <AlignLeft className="h-4 w-4" />, category: "dynamic",
    preview: "Pahayag na may kumakalat na bagong virus variant na nakakahawa umano sa pamamagitan ng titig.",
    accent: "bg-blue-500/20 text-blue-300",
    defaults: {
      width: 600, height: 130, fontSize: 22, fontWeight: "700",
      color: "#0f172a", textAlign: "left",
      backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 14, padding: 16,
    },
  },
  verdict: {
    label: "Verdict", icon: <Star className="h-4 w-4" />, category: "dynamic",
    preview: "HINDI TOTOO",
    accent: "bg-emerald-500/20 text-emerald-300",
    defaults: {
      width: 220, height: 58, fontSize: 26, fontWeight: "900",
      color: "#ffffff", textAlign: "center",
      backgroundColor: "#ef4444", borderRadius: 29, padding: 8,
    },
  },
  confidence: {
    label: "Confidence", icon: <BarChart2 className="h-4 w-4" />, category: "dynamic",
    preview: "98% Tiyak",
    accent: "bg-violet-500/20 text-violet-300",
    defaults: {
      width: 180, height: 46, fontSize: 18, fontWeight: "700",
      color: "#7c3aed", textAlign: "center",
      backgroundColor: "#ede9fe", borderRadius: 10, padding: 8,
    },
  },
  date: {
    label: "Date", icon: <Calendar className="h-4 w-4" />, category: "dynamic",
    preview: "Sinuri noong: Agosto 1, 2026",
    accent: "bg-sky-500/20 text-sky-300",
    defaults: {
      width: 260, height: 36, fontSize: 14, fontWeight: "500",
      color: "#475569", textAlign: "left",
      backgroundColor: "transparent", borderRadius: 0, padding: 4,
    },
  },
  list: {
    label: "List", icon: <List className="h-4 w-4" />, category: "dynamic",
    preview: "• Walang siyentipikong basehan ang pahayag na ito.\n• Hindi pinapasa ang virus sa pamamagitan ng tingin.\n• Kinumpirma ng DOH na fake news ang kumakalat na balita.",
    accent: "bg-amber-500/20 text-amber-300",
    defaults: {
      width: 500, height: 160, fontSize: 15, fontWeight: "400",
      color: "#1e293b", textAlign: "left",
      backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 12, padding: 14,
    },
  },
  sources: {
    label: "Sources", icon: <Link className="h-4 w-4" />, category: "dynamic",
    preview: "1. Department of Health (doh.gov.ph)\n2. World Health Organization (who.int)\n3. Vera Files Fact Check",
    accent: "bg-cyan-500/20 text-cyan-300",
    defaults: {
      width: 500, height: 140, fontSize: 13, fontWeight: "500",
      color: "#0f766e", textAlign: "left",
      backgroundColor: "rgba(240,253,252,0.95)", borderRadius: 10, padding: 12,
    },
  },
  summary: {
    label: "Buod ng Pagsusuri", icon: <FileText className="h-4 w-4" />, category: "dynamic",
    preview: "Ang kumakalat na sabi-sabi tungkol sa virus variant ay walang katotohanan at gawa-gawa lamang. Pinapaalalahanan ang lahat na kumuha lamang ng impormasyon sa mga opisyal na channels ng Kagawaran ng Kalusugan.",
    accent: "bg-orange-500/20 text-orange-300",
    defaults: {
      width: 580, height: 160, fontSize: 15, fontWeight: "400",
      color: "#1e293b", textAlign: "left",
      backgroundColor: "rgba(255,255,255,0.90)", borderRadius: 12, padding: 16,
      lineHeight: 1.6,
    },
  },
  text: {
    label: "Text", icon: <Type className="h-4 w-4" />, category: "static",
    preview: "Katotohanan Laban sa Kasinungalingan",
    accent: "bg-slate-500/20 text-slate-300",
    defaults: {
      width: 320, height: 50, fontSize: 16, fontWeight: "400",
      color: "#ffffff", textAlign: "left",
      backgroundColor: "transparent", borderRadius: 0, padding: 0,
      staticValue: "Katotohanan Laban sa Kasinungalingan",
    },
  },
  image: {
    label: "Image", icon: <ImageIcon className="h-4 w-4" />, category: "static",
    preview: "",
    accent: "bg-pink-500/20 text-pink-300",
    defaults: { width: 180, height: 180, backgroundColor: "#f1f5f9", borderRadius: 8, objectFit: "contain" },
  },
  qr_code: {
    label: "QR Code", icon: <QrCode className="h-4 w-4" />, category: "dynamic",
    preview: "https://teka-muna.pages.dev/result/sample-uuid",
    accent: "bg-indigo-500/20 text-indigo-300",
    defaults: { width: 120, height: 120, backgroundColor: "#ffffff", borderRadius: 6, padding: 6, color: "#000000" },
  },
  logo: {
    label: "Logo", icon: <Layout className="h-4 w-4" />, category: "static",
    preview: "",
    accent: "bg-yellow-500/20 text-yellow-300",
    defaults: { width: 160, height: 60, backgroundColor: "transparent", borderRadius: 0, objectFit: "contain" },
  },
};

const DYNAMIC_FIELDS = (Object.entries(FIELD_CATALOGUE) as [FieldType, FieldDef][])
  .filter(([, d]) => d.category === "dynamic").map(([type, def]) => ({ type, ...def }));
const STATIC_FIELDS  = (Object.entries(FIELD_CATALOGUE) as [FieldType, FieldDef][])
  .filter(([, d]) => d.category === "static").map(([type, def]) => ({ type, ...def }));

// ── Persistent field defaults (Supabase via Worker API) ──────────────────────
//
// When you save a template, the current style properties of each field type
// are stored in admin_settings (key: "field_defaults") via the Worker.
// Next time you open the editor from any device, those defaults are loaded
// and merged on top of the hardcoded catalogue defaults when adding fields.


// ── Small UI helpers ──────────────────────────────────────────────────────────

function PropLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">{children}</label>;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const safe = value.startsWith("#") && value.length >= 7 ? value : "#000000";
  return (
    <div className="space-y-1">
      <PropLabel>{label}</PropLabel>
      <div className="flex gap-1.5 items-center">
        <input
          type="color"
          className="h-8 w-8 rounded cursor-pointer border border-slate-700 bg-transparent shrink-0"
          value={safe}
          onChange={e => onChange(e.target.value)}
        />
        <Input
          className="bg-slate-900 border-slate-800 h-8 text-xs font-mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="transparent"
        />
      </div>
    </div>
  );
}

function NumField({ label, value, min = 0, max, step = 1, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <PropLabel>{label}</PropLabel>
      <Input
        type="number"
        min={min} max={max} step={step}
        className="bg-slate-900 border-slate-800 h-8 text-xs font-mono"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <PropLabel>{label}</PropLabel>
      <select
        className="flex h-8 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 text-xs focus:outline-none text-slate-200"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        {open ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</span>
      </button>
      {open && <div className="space-y-3 pl-1">{children}</div>}
    </div>
  );
}

// ── Field canvas preview ──────────────────────────────────────────────────────

function FieldPreview({ field }: { field: TemplateField }) {
  const def = FIELD_CATALOGUE[field.type];

  if (field.type === "image" || field.type === "logo") {
    return field.imageUrl ? (
      <img src={field.imageUrl} alt={field.label}
        className="w-full h-full pointer-events-none"
        style={{ objectFit: field.objectFit ?? "contain" }}
      />
    ) : (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 border border-dashed border-white/20 rounded">
        {def.icon}
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">{def.label}</span>
      </div>
    );
  }

  if (field.type === "qr_code") {
    return (
      <div className="w-full h-full flex items-center justify-center p-1">
        <QRCodeSVG
          value={field.staticValue || def.preview}
          size={Math.min(field.width, field.height)}
          bgColor="transparent"
          fgColor={field.color || "#000000"}
          level="M"
          className="w-full h-full object-contain pointer-events-none"
        />
      </div>
    );
  }

  const preview = field.type === "text"
    ? (field.staticValue || def.preview)
    : field.type === "verdict" && field.staticValue
    ? field.staticValue   // show the verdict-specific label set by addField
    : def.preview;

  return (
    <span
      className="block select-none pointer-events-none text-wrap"
      style={{
        width:       "100%",
        fontSize:    `${field.fontSize ?? 16}px`,
        fontWeight:  field.fontWeight ?? "400",
        lineHeight:  field.lineHeight ?? 1.5,
        textAlign:   field.textAlign ?? "left",
        whiteSpace: (field.type === "list" || field.type === "sources") ? "pre-line" : "normal",
        ...(field.maxLines
          ? {
              display:         "-webkit-box",
              WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
              WebkitLineClamp: field.maxLines,
              overflow:        "hidden",
            }
          : {
              display:  "block",
              overflow: "visible",
            }),
      }}
    >
      {preview}
    </span>
  );
}

// ── Type-specific properties panels ──────────────────────────────────────────

function TextProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <>
      <Section title="Typography">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Font Size (px)" value={f.fontSize ?? 16} min={4} max={400} onChange={v => set("fontSize", v)} />
          <SelectField label="Weight" value={f.fontWeight ?? "400"}
            options={[
              { value: "300", label: "Light" }, { value: "400", label: "Regular" },
              { value: "500", label: "Medium" }, { value: "600", label: "SemiBold" },
              { value: "700", label: "Bold"   }, { value: "900", label: "Black"   },
            ]}
            onChange={v => set("fontWeight", v)}
          />
        </div>
        <ColorField label="Color" value={f.color ?? "#ffffff"} onChange={v => set("color", v)} />
        <SelectField label="Alignment" value={f.textAlign ?? "left"}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
          onChange={v => set("textAlign", v)}
        />
        <NumField label="Line Height" value={f.lineHeight ?? 1.4} min={0.8} max={4} step={0.05}
          onChange={v => set("lineHeight", v)} />
        <NumField label="Max Lines (0 = unlimited)" value={f.maxLines ?? 0} min={0} max={20}
          onChange={v => set("maxLines", v === 0 ? undefined : v)} />
        <div className="space-y-1">
          <PropLabel>Font Family</PropLabel>
          <Input className="bg-slate-900 border-slate-800 h-8 text-xs font-mono"
            placeholder="Inter, system-ui" value={f.fontFamily ?? ""}
            onChange={e => set("fontFamily", e.target.value)} />
        </div>
      </Section>
      {f.type === "text" && (
        <Section title="Content">
          <div className="space-y-1">
            <PropLabel>Static Text</PropLabel>
            <textarea
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs focus:outline-none min-h-[72px] resize-none text-slate-200"
              value={f.staticValue ?? ""} placeholder="Enter text…"
              onChange={e => set("staticValue", e.target.value)}
            />
          </div>
        </Section>
      )}
      <Section title="Box">
        <ColorField label="Background Color" value={f.backgroundColor ?? "transparent"} onChange={v => set("backgroundColor", v)} />
        <BoxOpacityControl f={f} set={set} />
        <NumField label="Border Radius (px)" value={f.borderRadius ?? 0} min={0} max={100} onChange={v => set("borderRadius", v)} />
        <NumField label="Padding (px)" value={f.padding ?? 0} min={0} max={80} onChange={v => set("padding", v)} />
      </Section>
    </>
  );
}

function VerdictProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <>
      <Section title="Badge Style">
        <SelectField label="Shape"
          value={f.borderRadius !== undefined ? (f.borderRadius >= 20 ? "pill" : f.borderRadius >= 8 ? "rounded" : "square") : "pill"}
          options={[{ value: "pill", label: "Pill" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]}
          onChange={v => set("borderRadius", v === "pill" ? 999 : v === "rounded" ? 10 : 0)}
        />
        <NumField label="Border Radius (px)" value={f.borderRadius ?? 29} min={0} max={999}
          onChange={v => set("borderRadius", v)} />
        <NumField label="Padding (px)" value={f.padding ?? 8} min={0} max={80}
          onChange={v => set("padding", v)} />
      </Section>
      <Section title="Colors">
        <ColorField label="Background Color" value={f.backgroundColor ?? "#ef4444"} onChange={v => set("backgroundColor", v)} />
        <BoxOpacityControl f={f} set={set} />
        <ColorField label="Text Color" value={f.color ?? "#ffffff"} onChange={v => set("color", v)} />
      </Section>
      <Section title="Typography">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Font Size (px)" value={f.fontSize ?? 26} min={4} max={200} onChange={v => set("fontSize", v)} />
          <SelectField label="Weight" value={f.fontWeight ?? "900"}
            options={[{ value: "700", label: "Bold" }, { value: "800", label: "ExtraBold" }, { value: "900", label: "Black" }]}
            onChange={v => set("fontWeight", v)}
          />
        </div>
        <SelectField label="Alignment" value={f.textAlign ?? "center"}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
          onChange={v => set("textAlign", v)}
        />
      </Section>
    </>
  );
}

function ConfidenceProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <>
      <Section title="Typography">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Font Size (px)" value={f.fontSize ?? 18} min={4} max={120} onChange={v => set("fontSize", v)} />
          <SelectField label="Weight" value={f.fontWeight ?? "700"}
            options={[{ value: "500", label: "Medium" }, { value: "600", label: "SemiBold" }, { value: "700", label: "Bold" }, { value: "900", label: "Black" }]}
            onChange={v => set("fontWeight", v)}
          />
        </div>
        <ColorField label="Text Color" value={f.color ?? "#7c3aed"} onChange={v => set("color", v)} />
        <SelectField label="Alignment" value={f.textAlign ?? "center"}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
          onChange={v => set("textAlign", v)}
        />
      </Section>
      <Section title="Box">
        <ColorField label="Background Color" value={f.backgroundColor ?? "#ede9fe"} onChange={v => set("backgroundColor", v)} />
        <BoxOpacityControl f={f} set={set} />
        <NumField label="Border Radius (px)" value={f.borderRadius ?? 10} min={0} max={100} onChange={v => set("borderRadius", v)} />
        <NumField label="Padding (px)" value={f.padding ?? 8} min={0} max={80} onChange={v => set("padding", v)} />
      </Section>
    </>
  );
}

function DateProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <Section title="Typography">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Font Size (px)" value={f.fontSize ?? 14} min={4} max={80} onChange={v => set("fontSize", v)} />
        <SelectField label="Weight" value={f.fontWeight ?? "500"}
          options={[{ value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "SemiBold" }]}
          onChange={v => set("fontWeight", v)}
        />
      </div>
      <ColorField label="Text Color" value={f.color ?? "#475569"} onChange={v => set("color", v)} />
      <SelectField label="Alignment" value={f.textAlign ?? "left"}
        options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
        onChange={v => set("textAlign", v)}
      />
    </Section>
  );
}

function ListSourcesProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <>
      <Section title="Typography">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Font Size (px)" value={f.fontSize ?? 14} min={4} max={80} onChange={v => set("fontSize", v)} />
          <SelectField label="Weight" value={f.fontWeight ?? "400"}
            options={[{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "SemiBold" }]}
            onChange={v => set("fontWeight", v)}
          />
        </div>
        <ColorField label="Text Color" value={f.color ?? "#1e293b"} onChange={v => set("color", v)} />
        <NumField label="Line Height" value={f.lineHeight ?? 1.6} min={1} max={4} step={0.05} onChange={v => set("lineHeight", v)} />
      </Section>
      <Section title="Box">
        <ColorField label="Background Color" value={f.backgroundColor ?? "transparent"} onChange={v => set("backgroundColor", v)} />
        <BoxOpacityControl f={f} set={set} />
        <NumField label="Border Radius (px)" value={f.borderRadius ?? 10} min={0} max={100} onChange={v => set("borderRadius", v)} />
        <NumField label="Padding (px)" value={f.padding ?? 12} min={0} max={80} onChange={v => set("padding", v)} />
      </Section>
    </>
  );
}

function ImageLogoProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <>
      <Section title="Source">
        <div className="space-y-1">
          <PropLabel>Image URL</PropLabel>
          <Input className="bg-slate-900 border-slate-800 h-8 text-xs font-mono"
            placeholder="https://example.com/image.png"
            value={f.imageUrl ?? ""} onChange={e => set("imageUrl", e.target.value)} />
        </div>
        {f.imageUrl && (
          <img src={f.imageUrl} alt="Preview"
            className="w-full h-24 rounded-lg border border-slate-700 mt-2 object-contain bg-slate-950"
          />
        )}
        <SelectField label="Object Fit" value={f.objectFit ?? "contain"}
          options={[
            { value: "contain", label: "Contain" }, { value: "cover", label: "Cover" },
            { value: "fill",    label: "Fill"    }, { value: "none",  label: "None"  },
          ]}
          onChange={v => set("objectFit", v)}
        />
      </Section>
      <Section title="Box">
        <ColorField label="Background Color" value={f.backgroundColor ?? "transparent"} onChange={v => set("backgroundColor", v)} />
        <BoxOpacityControl f={f} set={set} />
        <NumField label="Border Radius (px)" value={f.borderRadius ?? 0} min={0} max={100} onChange={v => set("borderRadius", v)} />
      </Section>
    </>
  );
}

function QrCodeProps({ f, set }: { f: TemplateField; set: Setter }) {
  return (
    <Section title="QR Code">
      <p className="text-[10px] text-slate-500 leading-relaxed">
        The QR code is generated dynamically at share-image render time using the result URL. Configure its container box below.
      </p>
      <NumField label="Width (px)" value={f.width} min={40} max={600} onChange={v => set("width", v)} />
      <NumField label="Height (px)" value={f.height} min={40} max={600} onChange={v => set("height", v)} />
      <ColorField label="Background Color" value={f.backgroundColor ?? "#ffffff"} onChange={v => set("backgroundColor", v)} />
      <BoxOpacityControl f={f} set={set} />
      <ColorField label="QR Color (foreground)" value={f.color ?? "#000000"} onChange={v => set("color", v)} />
      <NumField label="Border Radius (px)" value={f.borderRadius ?? 6} min={0} max={80} onChange={v => set("borderRadius", v)} />
      <NumField label="Padding (px)" value={f.padding ?? 6} min={0} max={40} onChange={v => set("padding", v)} />
    </Section>
  );
}

// ── Verdict → default colors ──────────────────────────────────────────────────

/**
 * Convert any CSS color string + an opacity (0–100) into an rgba value.
 * Handles hex (#rgb, #rrggbb, #rrggbbaa) and already-rgba strings.
 * Falls back to "transparent" when the color is empty/transparent.
 */
function applyOpacityToColor(color: string | undefined, opacityPct: number): string {
  if (!color || color === "transparent" || opacityPct === 0) return "transparent";
  const alpha = Math.max(0, Math.min(1, opacityPct / 100));
  if (alpha >= 1) return color; // no change needed

  // Already rgba/hsla — replace the alpha channel
  const rgbaMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${alpha})`;

  // Hex color
  const hex = color.replace(/^#/, "");
  const full = hex.length === 3
    ? hex.split("").map(c => c + c).join("")
    : hex.length >= 6 ? hex.slice(0, 6) : null;
  if (!full) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * A reusable Box Opacity slider + "No Box" button used in all props panels
 * that have a backgroundColor. Lets the user fade the box independently
 * of the text — setting box opacity to 0 removes the box entirely while
 * keeping text fully visible.
 */
function BoxOpacityControl({ f, set }: { f: TemplateField; set: Setter }) {
  const val = f.backgroundOpacity ?? 100;
  const hasBox = f.backgroundColor && f.backgroundColor !== "transparent";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <PropLabel>Box Opacity (%)</PropLabel>
        {hasBox && (
          <button
            type="button"
            onClick={() => { set("backgroundOpacity", 0); }}
            className="text-[9px] font-black uppercase text-slate-500 hover:text-red-400 transition-colors tracking-wider"
            title="Remove box background"
          >
            No Box
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0} max={100} step={1}
          value={val}
          onChange={e => set("backgroundOpacity", parseInt(e.target.value, 10))}
          className="flex-1 h-2 cursor-pointer accent-primary"
        />
        <Input
          type="number"
          min={0} max={100} step={1}
          className="bg-slate-900 border-slate-800 h-8 text-xs font-mono w-14 shrink-0"
          value={val}
          onChange={e => set("backgroundOpacity", Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
        />
      </div>
    </div>
  );
}

const VERDICT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  true:        { bg: "#16a34a", text: "#ffffff", label: "TOTOO"           },
  false:       { bg: "#dc2626", text: "#ffffff", label: "HINDI TOTOO"     },
  misleading:  { bg: "#d97706", text: "#ffffff", label: "MAPANLINLANG"    },
  unverified:  { bg: "#64748b", text: "#ffffff", label: "HINDI MA-VERIFY" },
};

type Setter = (prop: keyof TemplateField, val: unknown) => void;

// ── Dispatch the right props component based on field type ────────────────────

function TypeProps({ f, set }: { f: TemplateField; set: Setter }) {
  switch (f.type) {
    case "claim":
    case "summary":
    case "text":      return <TextProps f={f} set={set} />;
    case "verdict":   return <VerdictProps f={f} set={set} />;
    case "confidence":return <ConfidenceProps f={f} set={set} />;
    case "date":      return <DateProps f={f} set={set} />;
    case "list":
    case "sources":   return <ListSourcesProps f={f} set={set} />;
    case "image":
    case "logo":      return <ImageLogoProps f={f} set={set} />;
    case "qr_code":   return <QrCodeProps f={f} set={set} />;
    default:          return null;
  }
}

// ── Loader helper ─────────────────────────────────────────────────────────────

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// ── Sidebar field button ──────────────────────────────────────────────────────

function FieldButton({ type, label, icon, accent, onClick }: {
  type: FieldType; label: string; icon: React.ReactNode; accent: string; onClick: () => void;
}) {
  return (
    <button key={type} type="button" onClick={onClick}
      className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg border border-slate-800 hover:border-primary/50 bg-slate-900/50 hover:bg-slate-800/70 text-xs font-bold text-slate-200 transition-all active:scale-[0.97] cursor-pointer"
    >
      <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${accent}`}>{icon}</div>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Copy Layout Modal ─────────────────────────────────────────────────────────
//
// Lets the user copy the current template's config_json to other verdict
// templates on the same platform. The verdict field colors are automatically
// swapped to match each target verdict — everything else stays identical.

const VERDICT_META: { value: string; label: string; dot: string }[] = [
  { value: "true",       label: "Totoo",          dot: "bg-emerald-500" },
  { value: "false",      label: "Hindi Totoo",    dot: "bg-red-500"     },
  { value: "misleading", label: "Mapanlinlang",   dot: "bg-amber-500"   },
  { value: "unverified", label: "Hindi Ma-verify", dot: "bg-slate-400"  },
];

interface CopyLayoutModalProps {
  template: PostTemplate;
  fields:   TemplateField[];
  token:    string | null;
  onClose:  () => void;
}

function CopyLayoutModal({ template, fields, token, onClose }: CopyLayoutModalProps) {
  const [targets,   setTargets]   = useState<PostTemplate[]>([]);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);
  const [copying,   setCopying]   = useState(false);
  const [doneIds,   setDoneIds]   = useState<Set<string>>(new Set());
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  // Fetch all templates on the same platform, excluding the current one
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/post-templates`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Failed to load templates");
        const data = await res.json() as { data: PostTemplate[] };
        const others = (data.data ?? []).filter(
          t => t.platform === template.platform && t.id !== template.id
        );
        setTargets(others);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Error loading templates");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [template, token]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Swap verdict field colors to match the target template's verdict
  function applyVerdictColors(
    sourceFields: TemplateField[],
    targetVerdict: string,
  ): TemplateField[] {
    const vc = VERDICT_COLORS[targetVerdict];
    if (!vc) return sourceFields;
    return sourceFields.map(f => {
      if (f.type !== "verdict") return f;
      return {
        ...f,
        backgroundColor: vc.bg,
        color:           vc.text,
        staticValue:     vc.label,
      };
    });
  }

  async function handleCopy() {
    if (selected.size === 0) return;
    setCopying(true);
    setErrorMsg(null);
    const done = new Set<string>();

    for (const targetId of selected) {
      const target = targets.find(t => t.id === targetId);
      if (!target) continue;
      const adapted = applyVerdictColors(fields, target.verdict);
      try {
        const res = await fetch(`${API_BASE_URL}/admin/post-templates/${targetId}`, {
          method:  "PATCH",
          headers: {
            "Content-Type":  "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ config_json: adapted }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
        done.add(targetId);
        setDoneIds(new Set(done)); // update UI progressively
      } catch (e) {
        setErrorMsg(
          `Failed to copy to "${target.name}": ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    }

    setCopying(false);
    // Auto-close after a short delay if everything succeeded
    if (done.size === selected.size) {
      setTimeout(onClose, 1200);
    }
  }

  const otherVerdicts = VERDICT_META.filter(v => v.value !== template.verdict);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <p className="font-extrabold text-sm text-white">Copy Layout To</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Same platform · verdict colors auto-swapped
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
              <Loader2Icon className="h-4 w-4 animate-spin" /> Loading templates…
            </div>
          )}

          {!loading && targets.length === 0 && (
            <div className="text-center py-6 text-slate-500 text-sm">
              No other {template.platform === "instagram" ? "FB / IG" : "Story"} templates found.
              <p className="text-xs mt-1 text-slate-600">Create templates for the other verdicts first.</p>
            </div>
          )}

          {!loading && targets.length > 0 && (
            <>
              {/* Group by verdict for clarity */}
              {otherVerdicts.map(vm => {
                const verdictTargets = targets.filter(t => t.verdict === vm.value);
                if (verdictTargets.length === 0) return null;
                return (
                  <div key={vm.value} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      <span className={`h-1.5 w-1.5 rounded-full ${vm.dot}`} />
                      {vm.label}
                    </div>
                    {verdictTargets.map(t => {
                      const isDone = doneIds.has(t.id);
                      const isChecked = selected.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => !isDone && toggle(t.id)}
                          disabled={copying || isDone}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            isDone
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 cursor-default"
                              : isChecked
                              ? "border-primary/60 bg-primary/10 text-white"
                              : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                          }`}
                        >
                          <div className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isDone
                              ? "border-emerald-500 bg-emerald-500"
                              : isChecked
                              ? "border-primary bg-primary"
                              : "border-slate-600 bg-transparent"
                          }`}>
                            {isDone
                              ? <Check className="h-3 w-3 text-white" />
                              : isChecked
                              ? <Check className="h-3 w-3 text-white" />
                              : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{t.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {t.is_active ? "● Active" : "○ Inactive"}
                            </p>
                          </div>
                          {isDone && <span className="text-[10px] font-bold text-emerald-400">Copied</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Footer */}
        {!loading && targets.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800">
            <p className="text-xs text-slate-500">
              {selected.size > 0 ? `${selected.size} template${selected.size > 1 ? "s" : ""} selected` : "Select templates above"}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCopy}
                disabled={selected.size === 0 || copying}
                className="gap-1.5"
              >
                {copying
                  ? <><Loader2Icon className="h-3.5 w-3.5 animate-spin" /> Copying…</>
                  : <><CopyCheck className="h-3.5 w-3.5" /> Copy to {selected.size > 0 ? selected.size : ""} Template{selected.size !== 1 ? "s" : ""}</>
                }
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TemplateEditor({ template, onBack, onSaveSuccess, token }: TemplateEditorProps) {
  const [fields,      setFields]      = useState<TemplateField[]>(template.config_json || []);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [savedOk,     setSavedOk]     = useState(false);
  const [scale,       setScale]       = useState(1);
  const [hasChanges,  setHasChanges]  = useState(false);

  // Saved field style defaults — loaded from Supabase on mount
  const [fieldDefaults, setFieldDefaults] = useState<FieldDefaultsMap>({});
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  useEffect(() => {
    if (token) {
      void fetchFieldDefaults(token).then(setFieldDefaults);
    }
  }, [token]);

  // Polish state tokens
  const [snapToGrid,  setSnapToGrid]  = useState(true);
  const [gridSize,    setGridSize]    = useState(10);
  const [zoomLevel,   setZoomLevel]   = useState(100); // percentage

  // Undo/Redo Stacks
  const [history,     setHistory]     = useState<TemplateField[][]>([template.config_json || []]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Preview generation state
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const workspaceRef  = useRef<HTMLDivElement>(null);
  const canvasDOMRef  = useRef<HTMLDivElement>(null);

  // Keep fieldsRef updated with latest fields state to avoid stale closure references
  const fieldsRef     = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // ── Push History State ──────────────────────────────────────────────────────

  const updateFieldsWithHistory = useCallback((newFields: TemplateField[] | ((prev: TemplateField[]) => TemplateField[])) => {
    setFields(prev => {
      const next = typeof newFields === "function" ? newFields(prev) : newFields;
      // Push to history stack if modified
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        const histCopy = history.slice(0, historyIndex + 1);
        setHistory([...histCopy, next]);
        setHistoryIndex(histCopy.length);
        setHasChanges(true);
      }
      return next;
    });
  }, [history, historyIndex]);

  // ── Undo / Redo Actions ────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setFields(history[prevIdx]);
      setHasChanges(true);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setFields(history[nextIdx]);
      setHasChanges(true);
    }
  }, [history, historyIndex]);

  // ── Scale & Zoom Calculation ───────────────────────────────────────────────

  const updateScale = useCallback((w: number, h: number) => {
    if (!w || !h) return;
    const pad = 56;
    const baseScale = Math.min((w - pad) / template.canvas_width, (h - pad) / template.canvas_height, 1);
    setScale(baseScale * (zoomLevel / 100));
  }, [template.canvas_width, template.canvas_height, zoomLevel]);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    updateScale(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      updateScale(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScale]);

  // ── Unsaved guard ─────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (hasChanges) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasChanges]);

  const handleBack = () => {
    if (hasChanges && !confirm("May hindi pa nai-save na pagbabago. Bumalik pa rin?")) return;
    onBack();
  };

  // ── Add field ─────────────────────────────────────────────────────────────

  const addField = (type: FieldType) => {
    const def           = FIELD_CATALOGUE[type];
    const id            = `${type}_${Date.now()}`;

    const verdictOverrides: Partial<TemplateField> = {};
    if (type === "verdict") {
      const vc = VERDICT_COLORS[template.verdict];
      if (vc) {
        verdictOverrides.backgroundColor = vc.bg;
        verdictOverrides.color           = vc.text;
        verdictOverrides.staticValue     = vc.label;
      }
    }

    const newField: TemplateField = {
      id, type, label: def.label,
      x: 60, y: 60,
      width:  def.defaults.width  ?? 200,
      height: def.defaults.height ?? 80,
      visible: true, zIndex: fields.length + 1,
      // hardcoded defaults → saved user defaults → verdict overrides
      ...def.defaults,
      ...(fieldDefaults[type] ?? {}),
      ...verdictOverrides,
    };
    updateFieldsWithHistory(prev => [...prev, newField]);
    setSelectedId(id);
  };

  // ── Duplicate Field ────────────────────────────────────────────────────────

  const handleDuplicate = useCallback((id: string) => {
    const f = fields.find(field => field.id === id);
    if (!f) return;
    const newId = `${f.type}_${Date.now()}`;
    const dup: TemplateField = {
      ...f,
      id: newId,
      label: `${f.label} Copied`,
      x: Math.min(template.canvas_width - f.width, f.x + 30),
      y: Math.min(template.canvas_height - f.height, f.y + 30),
      zIndex: fields.length + 1,
      locked: false,
    };
    updateFieldsWithHistory(prev => [...prev, dup]);
    setSelectedId(newId);
  }, [fields, template, updateFieldsWithHistory]);

  // ── Drag with snap ─────────────────────────────────────────────────────────

  const startDrag = (e: React.MouseEvent, fieldId: string) => {
    e.preventDefault();
    setSelectedId(fieldId);
    const f = fields.find(f => f.id === fieldId)!;
    if (f.locked) return; // ignore dragging locked fields

    const sx = e.clientX, sy = e.clientY;
    const ix = f.x, iy = f.y;

    const onMove = (mv: MouseEvent) => {
      const dx = (mv.clientX - sx) / scale, dy = (mv.clientY - sy) / scale;
      let targetX = Math.round(ix + dx);
      let targetY = Math.round(iy + dy);

      if (snapToGrid) {
        targetX = Math.round(targetX / gridSize) * gridSize;
        targetY = Math.round(targetY / gridSize) * gridSize;
      }

      setFields(prev => prev.map(pf => pf.id === fieldId ? {
        ...pf,
        x: Math.max(0, Math.min(template.canvas_width  - pf.width,  targetX)),
        y: Math.max(0, Math.min(template.canvas_height - pf.height, targetY)),
      } : pf));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Push history state upon drag complete using the latest ref value
      updateFieldsWithHistory(fieldsRef.current);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Resize with snap ───────────────────────────────────────────────────────

  const startResize = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation(); e.preventDefault();
    const f = fields.find(f => f.id === fieldId)!;
    if (f.locked) return;

    const sx = e.clientX, sy = e.clientY;
    const iw = f.width, ih = f.height;

    const onMove = (mv: MouseEvent) => {
      const dx = (mv.clientX - sx) / scale, dy = (mv.clientY - sy) / scale;
      let targetW = Math.round(iw + dx);
      let targetH = Math.round(ih + dy);

      if (snapToGrid) {
        targetW = Math.round(targetW / gridSize) * gridSize;
        targetH = Math.round(targetH / gridSize) * gridSize;
      }

      setFields(prev => prev.map(pf => pf.id === fieldId ? {
        ...pf,
        width:  Math.max(40, Math.min(template.canvas_width  - pf.x, targetW)),
        height: Math.max(24, Math.min(template.canvas_height - pf.y, targetH)),
      } : pf));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Push history state upon resize complete using the latest ref value
      updateFieldsWithHistory(fieldsRef.current);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Delete / property update ──────────────────────────────────────────────

  const deleteField = useCallback((id: string) => {
    updateFieldsWithHistory(prev => prev.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, updateFieldsWithHistory]);

  const set: Setter = (prop, val) => {
    if (!selectedId) return;
    updateFieldsWithHistory(prev => prev.map(f => f.id === selectedId ? { ...f, [prop]: val } : f));
  };

  // ── Front / Back Layers Z-Index ────────────────────────────────────────────

  const handleBringToFront = (id: string) => {
    const maxZ = fields.reduce((max, f) => Math.max(max, f.zIndex), 0);
    setFields(prev => prev.map(f => f.id === id ? { ...f, zIndex: maxZ + 1 } : f));
    updateFieldsWithHistory(fields);
  };

  const handleSendToBack = (id: string) => {
    const minZ = fields.reduce((min, f) => Math.min(min, f.zIndex), 9999);
    setFields(prev => prev.map(f => f.id === id ? { ...f, zIndex: Math.max(1, minZ - 1) } : f));
    updateFieldsWithHistory(fields);
  };

  // ── Keyboard Shortcuts Listener ────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut actions if typing inside inputs or textareas
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // Undo: Ctrl + Z
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Redo: Ctrl + Y
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Duplicate: Ctrl + D
      if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedId) handleDuplicate(selectedId);
        return;
      }
      // Save Layout: Ctrl + S
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
        return;
      }
      // Delete: Backspace / Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedId) deleteField(selectedId);
        return;
      }

      // Nudging with Arrow Keys
      if (selectedId && ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const nudgedField = fields.find(f => f.id === selectedId);
        if (!nudgedField || nudgedField.locked) return;

        const distance = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === "ArrowUp") dy = -distance;
        if (e.key === "ArrowDown") dy = distance;
        if (e.key === "ArrowLeft") dx = -distance;
        if (e.key === "ArrowRight") dx = distance;

        updateFieldsWithHistory(prev => prev.map(f => f.id === selectedId ? {
          ...f,
          x: Math.max(0, Math.min(template.canvas_width - f.width, f.x + dx)),
          y: Math.max(0, Math.min(template.canvas_height - f.height, f.y + dy)),
        } : f));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, fields, handleUndo, handleRedo, handleDuplicate, deleteField, updateFieldsWithHistory, template]);

  // ── Save Database API ─────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true); setSaveError(null); setSavedOk(false);
    const payload = { config_json: fields };

    console.group(`[TemplateEditor] Saving "${template.name}"`);
    console.log("template.id:", template.id);
    console.log("config_json (%d fields):", fields.length, JSON.stringify(payload, null, 2));
    console.groupEnd();

    try {
      const res = await fetch(`${API_BASE_URL}/admin/post-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }
      setHasChanges(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      // Persist the current field styles as defaults for next time (server-side)
      void persistFieldDefaults(fields, token, fieldDefaults).then(() => {
        // Update local state so addField picks up the new defaults immediately
        fetchFieldDefaults(token).then(setFieldDefaults);
      });
      onSaveSuccess();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error saving");
    } finally { setSaving(false); }
  };

  // ── Export Canvas as PNG (html-to-image) ───────────────────────────────────

  const handleGeneratePreview = async () => {
    if (!canvasDOMRef.current) return;
    setGeneratingPreview(true);

    try {
      const currentSelected = selectedId;
      setSelectedId(null);

      // Wait for React to deselect fields and for the background img to load
      await new Promise(resolve => setTimeout(resolve, 300));

      const dataUrl = await toPng(canvasDOMRef.current, {
        width:      template.canvas_width,
        height:     template.canvas_height,
        pixelRatio: 1,
        cacheBust:  true,
        style: {
          transform:       "scale(1)",
          transformOrigin: "top left",
          left:            "0px",
          top:             "0px",
        },
      });

      setSelectedId(currentSelected);
      downloadPng(dataUrl, `${template.name}_preview.png`);
    } catch (error) {
      console.error("Failed to generate preview PNG:", error);
      alert("Naging sanhi ng error ang pag-export ng larawan. Subukan muli.");
    } finally {
      setGeneratingPreview(false);
    }
  };

  const sel      = fields.find(f => f.id === selectedId);
  const rawBgUrl = template.storage_path ? getPublicUrl(template.storage_path) : "";

  // Pre-fetch the background as a data URL so html-to-image and <img> never
  // hit a CORS-tainted canvas on Safari / production.
  const [bgUrl, setBgUrl] = useState(rawBgUrl);
  useEffect(() => {
    if (!rawBgUrl) { setBgUrl(""); return; }
    let cancelled = false;
    fetch(rawBgUrl)
      .then(r => r.blob())
      .then(blob => new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      }))
      .then(dataUrl => { if (!cancelled) setBgUrl(dataUrl); })
      .catch(() => { if (!cancelled) setBgUrl(rawBgUrl); }); // fallback to URL
    return () => { cancelled = true; };
  }, [rawBgUrl]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100 overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBack} className="text-slate-400 hover:text-white h-8 px-3 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />Back
          </Button>
          <div className="h-4 w-px bg-slate-800" />
          <div>
            <h2 className="font-extrabold text-sm leading-none">{template.name}</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
              {template.platform.toUpperCase()} &middot; {template.canvas_width} &times; {template.canvas_height} px
            </p>
          </div>
        </div>

        {/* Toolbar Center Controls */}
        <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl">
          {/* Undo/Redo */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex === 0}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex === history.length - 1}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-3.5 bg-slate-800" />

          {/* Grid Snap Control */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSnapToGrid(!snapToGrid)}
              className={`text-2xs font-black uppercase px-2 py-0.5 rounded transition-all ${
                snapToGrid ? "bg-primary/20 text-primary border border-primary/45" : "bg-transparent text-slate-500 border border-slate-800 hover:text-slate-350"
              }`}
              title="Toggle Snap to Grid"
            >
              GRID SNAP
            </button>
            {snapToGrid && (
              <select
                value={gridSize}
                onChange={e => setGridSize(parseInt(e.target.value, 10) || 5)}
                className="bg-slate-950 border border-slate-800 text-[10px] h-5 rounded px-1 text-slate-300 focus:outline-none"
              >
                <option value="5">5px</option>
                <option value="10">10px</option>
                <option value="20">20px</option>
              </select>
            )}
          </div>

          <div className="w-px h-3.5 bg-slate-800" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(25, prev - 25))}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 min-w-[32px] text-center">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(200, prev + 25))}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {savedOk && <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">✓ Saved!</span>}
          {hasChanges && !savedOk && <span className="text-xs text-amber-400 font-semibold animate-pulse">• Unsaved</span>}
          
          <Button
            type="button"
            variant="outline"
            onClick={handleGeneratePreview}
            disabled={generatingPreview}
            className="h-9 px-3.5 gap-1.5 text-xs text-slate-200 border-slate-850 hover:bg-slate-800"
          >
            {generatingPreview ? <Loader2 className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            Generate Preview
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setCopyModalOpen(true)}
            className="h-9 px-3.5 gap-1.5 text-xs text-slate-200 border-slate-700 hover:bg-slate-800"
            title="Copy this layout to other verdict templates"
          >
            <CopyCheck className="h-3.5 w-3.5" />
            Copy Layout
          </Button>

          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 h-9">
            {saving ? <Loader2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            Save Layout
          </Button>
        </div>
      </header>

      {saveError && (
        <div className="px-5 py-2 text-xs text-red-300 bg-red-500/15 border-b border-red-500/25 shrink-0">
          Save failed: {saveError}
        </div>
      )}

      {/* 3-column workspace */}
      <div className="flex-1 flex overflow-hidden text-wrap">

        {/* ── Left: Field Picker ── */}
        <aside className="w-52 bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden shrink-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div className="space-y-1.5">
              <Divider label="Dynamic" />
              {DYNAMIC_FIELDS.map(({ type, label, icon, accent }) => (
                <FieldButton key={type} type={type} label={label} icon={icon} accent={accent} onClick={() => addField(type)} />
              ))}
            </div>
            <div className="space-y-1.5">
              <Divider label="Static" />
              {STATIC_FIELDS.map(({ type, label, icon, accent }) => (
                <FieldButton key={type} type={type} label={label} icon={icon} accent={accent} onClick={() => addField(type)} />
              ))}
            </div>
          </div>
          <div className="px-3 py-2 border-t border-slate-800 text-[10px] text-slate-600 font-semibold flex justify-between items-center">
            <span>{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
            <span className="text-2xs opacity-40 font-mono">Ctrl+H shortcuts</span>
          </div>
        </aside>

        {/* ── Centre: Canvas ── */}
        <div
          ref={workspaceRef}
          className="flex-1 bg-[#0f1117] flex items-center justify-center overflow-hidden relative select-none"
          onMouseDown={() => setSelectedId(null)}
        >
          {/* Snap alignment background grid guidelines */}
          {snapToGrid && (
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
                backgroundSize: `${gridSize}px ${gridSize}px`
              }}
            />
          )}

          <div
            ref={canvasDOMRef}
            id="template-canvas-stage"
            className="relative shadow-2xl overflow-hidden border border-slate-700 transition-transform duration-75"
            style={{
              width:           template.canvas_width,
              height:          template.canvas_height,
              transform:       `scale(${scale})`,
              transformOrigin: "center center",
              backgroundColor: bgUrl ? undefined : "#1e293b",
            }}
          >
            {/* Background rendered as <img> — CSS backgroundImage is not captured
                by html-to-image on Safari/production (canvas CORS taint). */}
            {bgUrl && (
              <img
                src={bgUrl}
                alt=""
                crossOrigin="anonymous"
                style={{
                  position:  "absolute",
                  inset:     0,
                  width:     "100%",
                  height:    "100%",
                  objectFit: "cover",
                  zIndex:    0,
                  display:   "block",
                }}
              />
            )}
            {fields.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <Layout className="h-14 w-14 text-slate-700" />
                <p className="text-slate-600 text-sm font-semibold">Click a field to add it to the canvas</p>
              </div>
            )}

            {fields.map(field => {
              if (!field.visible) return null;
              const isSelected = field.id === selectedId;
              const def        = FIELD_CATALOGUE[field.type];
              const opacity    = field.opacity !== undefined ? field.opacity / 100 : 1;

              return (
                <div
                  key={field.id}
                  onMouseDown={e => { e.stopPropagation(); startDrag(e, field.id); }}
                  onClick={e => e.stopPropagation()}
                  className={`absolute cursor-move ${
                    isSelected
                      ? "outline outline-2 outline-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]"
                      : "hover:outline hover:outline-1 hover:outline-white/25"
                  }`}
                  style={{
                    left:            field.x,
                    top:             field.y,
                    width:           field.width,
                    minHeight:       field.height,  // min not fixed — text grows down, never clips
                    zIndex:          field.zIndex,
                    opacity,
                    overflow:        "visible",     // never clip descenders
                    transform:       field.rotation ? `rotate(${field.rotation}deg)` : undefined,
                    fontFamily:      field.fontFamily || "Inter, system-ui, sans-serif",
                    color:           field.color || "#ffffff",
                    backgroundColor: applyOpacityToColor(
                      field.backgroundColor,
                      field.backgroundOpacity ?? 100,
                    ),
                    borderRadius:    field.borderRadius ? `${field.borderRadius}px` : undefined,
                    padding:         field.padding ? `${field.padding}px` : undefined,
                    display:         "flex",
                    flexDirection:   "column",
                    justifyContent:  "center",
                    alignItems:      "stretch",
                  }}
                >
                  <FieldPreview field={field} />

                  {/* Lock Indicator badge */}
                  {field.locked && (
                    <div className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded text-slate-400" title="Locked">
                      <Lock className="h-2.5 w-2.5" />
                    </div>
                  )}

                  {isSelected && (
                    <div className={`absolute top-0 left-0 px-1.5 py-0.5 text-[9px] font-black uppercase rounded-br ${def.accent}`}>
                      {def.label}
                    </div>
                  )}

                  {isSelected && !field.locked && (
                    <div
                      onMouseDown={e => startResize(e, field.id)}
                      className="absolute bottom-0 right-0 h-5 w-5 bg-primary cursor-se-resize flex items-center justify-center rounded-tl"
                    >
                      <Move className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Properties Panel ── */}
        <aside className="w-72 bg-slate-950 border-l border-slate-800 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-slate-800 shrink-0 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Properties</h3>
            {sel && (
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${FIELD_CATALOGUE[sel.type].accent}`}>
                {FIELD_CATALOGUE[sel.type].label}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sel ? (
              <>
                {/* Polish Quick Actions */}
                <div className="flex items-center gap-1.5 pb-2 border-b border-slate-850">
                  {/* Lock Toggle */}
                  <button
                    type="button"
                    onClick={() => set("locked", !sel.locked)}
                    className={`p-1.5 rounded border flex-1 text-2xs font-extrabold uppercase flex items-center justify-center gap-1.5 transition-all ${
                      sel.locked ? "bg-red-500/10 border-red-500/40 text-red-400" : "bg-transparent border-slate-800 text-slate-400 hover:text-white"
                    }`}
                    title={sel.locked ? "Unlock element" : "Lock element"}
                  >
                    {sel.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    {sel.locked ? "Locked" : "Lock"}
                  </button>

                  {/* Duplicate Field */}
                  <button
                    type="button"
                    onClick={() => handleDuplicate(sel.id)}
                    className="p-1.5 rounded border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 transition-all text-2xs font-extrabold uppercase flex items-center justify-center gap-1"
                    title="Duplicate element (Ctrl+D)"
                  >
                    <Copy className="h-3 w-3" />
                    Dup
                  </button>

                  {/* Bring to Front */}
                  <button
                    type="button"
                    onClick={() => handleBringToFront(sel.id)}
                    className="p-1.5 rounded border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 transition-all text-2xs font-extrabold uppercase flex items-center justify-center gap-1"
                    title="Bring to front"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>

                  {/* Send to Back */}
                  <button
                    type="button"
                    onClick={() => handleSendToBack(sel.id)}
                    className="p-1.5 rounded border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 transition-all text-2xs font-extrabold uppercase flex items-center justify-center gap-1"
                    title="Send to back"
                  >
                    <ChevronDownIcon className="h-3 w-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    className="bg-slate-900 border-slate-800 h-8 text-xs flex-1"
                    value={sel.label}
                    onChange={e => set("label", e.target.value)}
                    placeholder="Label"
                  />
                  <button type="button" onClick={() => set("visible", !sel.visible)}
                    className="p-1.5 text-slate-400 hover:text-white rounded border border-slate-800 hover:border-slate-600"
                    title="Toggle visibility"
                  >
                    {sel.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => deleteField(sel.id)}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded border border-slate-800 hover:border-red-700"
                    title="Delete field"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Section title="Position &amp; Size">
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label="X (px)" value={sel.x} min={0} onChange={v => set("x", v)} />
                    <NumField label="Y (px)" value={sel.y} min={0} onChange={v => set("y", v)} />
                    <NumField label="Width (px)"  value={sel.width}  min={20} onChange={v => set("width", v)} />
                    <NumField label="Height (px)" value={sel.height} min={12} onChange={v => set("height", v)} />
                  </div>
                </Section>

                <Section title="Transform" defaultOpen={true}>
                  <NumField label="Rotation (°)" value={sel.rotation ?? 0} min={-360} max={360} step={1}
                    onChange={v => set("rotation", v === 0 ? undefined : v)} />
                  {/* Opacity — number + range slider for intuitive editing */}
                  <div className="space-y-1">
                    <PropLabel>Opacity (%)</PropLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0} max={100} step={1}
                        value={sel.opacity ?? 100}
                        onChange={e => set("opacity", parseInt(e.target.value, 10))}
                        className="flex-1 h-2 cursor-pointer accent-primary"
                      />
                      <Input
                        type="number"
                        min={0} max={100} step={1}
                        className="bg-slate-900 border-slate-800 h-8 text-xs font-mono w-16 shrink-0"
                        value={sel.opacity ?? 100}
                        onChange={e => set("opacity", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <NumField label="Z-Index" value={sel.zIndex} min={1} max={999}
                    onChange={v => set("zIndex", v)} />
                </Section>

                <TypeProps f={sel} set={set} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-slate-600 py-16">
                <Layout className="h-10 w-10 opacity-25" />
                <p className="text-xs font-semibold">Select a field on the canvas<br/>to edit its properties</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Copy Layout Modal */}
      {copyModalOpen && (
        <CopyLayoutModal
          template={template}
          fields={fields}
          token={token}
          onClose={() => setCopyModalOpen(false)}
        />
      )}
    </div>
  );
}
