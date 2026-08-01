/**
 * src/types/postTemplate.ts
 *
 * TypeScript types for the Post Template Management system.
 * These mirror the Supabase `post_templates` table and its enums exactly.
 *
 * Used by:
 *   - worker/services/postTemplates.ts  (CRUD against Supabase)
 *   - worker/routes/postTemplates.ts    (API request/response contracts)
 *   - src/components/template-editor/  (canvas renderer + drag UI — future)
 *   - src/services/shareImageService.ts (generate share image — future)
 *
 * Rules:
 *   - This file contains ONLY types and type guards. No logic.
 *   - All string unions mirror the PostgreSQL enum values verbatim.
 *   - Every nullable DB column is typed `string | null` (not `undefined`).
 */

// ── Enums (mirror PostgreSQL enum types) ──────────────────────────────────────

/**
 * Social media platform the generated image is intended for.
 * Maps to the `template_platform` PostgreSQL enum.
 */
export type TemplatePlatform =
  | "facebook"    // 1200 × 630  (landscape)
  | "instagram"   // 1080 × 1080 (square)
  | "story";      // 1080 × 1920 (portrait 9:16) — FB Stories & IG Stories

/**
 * Verdict the template is designed for.
 * Maps to the `template_verdict` PostgreSQL enum.
 * Must stay in sync with the `Verdict` type in src/types/verify.ts.
 */
export type TemplateVerdict =
  | "true"
  | "false"
  | "misleading"
  | "unverified";

/**
 * The kind of content a field slot renders on the canvas.
 * Maps to the `field_type` PostgreSQL enum.
 *
 * Dynamic types pull live data from a VerifyResult at render time.
 * Static types have fixed content stored inside the field definition itself.
 */
export type FieldType =
  | "text"
  | "claim"
  | "verdict"
  | "confidence"
  | "date"
  | "list"
  | "sources"
  | "summary"
  | "image"
  | "qr_code"
  | "logo";

// ── Field definition ──────────────────────────────────────────────────────────

/**
 * A single draggable element on the template canvas.
 * Stored as items inside `post_templates.config_json` (a JSONB array).
 *
 * Position and size are in canvas pixels (not percentages) so the renderer
 * can place them exactly without knowing the viewport size.
 */
export interface TemplateField {
  // ── Identity ───────────────────────────────────────────────────────────────
  /** Unique identifier within this template. Used as React key and drag handle ID. */
  id:     string;
  /** What content this field renders. */
  type:   FieldType;
  /** Human-readable name shown in the template editor panel (e.g. "Claim Box"). */
  label:  string;

  // ── Position (px from canvas top-left, set by drag) ───────────────────────
  x: number;
  y: number;

  // ── Size (px) ─────────────────────────────────────────────────────────────
  width:  number;
  height: number;

  // ── Text styling (applies to all text-rendering field types) ──────────────
  /** CSS font-family string. e.g. "Inter", "Arial Black". */
  fontFamily?:  string;
  /** Font size in canvas pixels. */
  fontSize?:    number;
  /** CSS font-weight value. e.g. "400", "700", "900". */
  fontWeight?:  string;
  /** Text colour as CSS hex or rgba. e.g. "#ffffff", "rgba(0,0,0,0.8)". */
  color?:       string;
  /** Horizontal text alignment. */
  textAlign?:   "left" | "center" | "right";
  /** Line height multiplier. e.g. 1.4 means 140% of font size. */
  lineHeight?:  number;
  /** Clamp text to this many lines. Overflow is hidden with ellipsis. */
  maxLines?:    number;

  // ── Box styling (optional background behind the field) ────────────────────
  /** Background fill colour. Use "transparent" for no background. */
  backgroundColor?: string;
  /** Border radius in canvas pixels. */
  borderRadius?:    number;
  /** Inner padding in canvas pixels (applied equally to all four sides). */
  padding?:         number;

  // ── Static content ─────────────────────────────────────────────────────────
  /** Literal text to render. Required when type === "text". */
  staticValue?: string;
  /** Public URL of the image. Required when type === "image" | "logo". */
  imageUrl?:    string;
  /** CSS object-fit value for image fields. */
  objectFit?:   "contain" | "cover" | "fill" | "none";

  // ── Transform ──────────────────────────────────────────────────────────────
  /** Rotation in degrees (clockwise). 0 = no rotation. */
  rotation?: number;
  /**
   * Whole-element opacity 0–100 (affects text + box together).
   * Use backgroundOpacity to make only the box transparent.
   * Default: 100 (fully opaque).
   */
  opacity?:           number;
  /**
   * Background-only opacity 0–100.
   * Lets you make the box transparent while keeping text fully visible.
   * Applied by blending into the backgroundColor as an rgba value.
   * Default: 100 (fully opaque background).
   */
  backgroundOpacity?: number;

  // ── Layer control ──────────────────────────────────────────────────────────
  /** Whether this field appears in the rendered output. */
  visible: boolean;
  /** Stacking order — higher value renders on top. */
  zIndex:  number;
  /** Locked state — prevents dragging and resizing. */
  locked?: boolean;
}

// ── Database row ──────────────────────────────────────────────────────────────

/**
 * Full row shape returned by Supabase SELECT queries on `post_templates`.
 * All columns are present, nullable columns use `string | null`.
 */
export interface PostTemplate {
  id:             string;
  name:           string;
  platform:       TemplatePlatform;
  verdict:        TemplateVerdict;
  canvas_width:   number;
  canvas_height:  number;
  /**
   * Path relative to the `template-assets` bucket root.
   * e.g. "backgrounds/facebook-false.png"
   * NULL means no image uploaded yet.
   * Build the full URL via: supabase.storage.from('template-assets').getPublicUrl(storage_path)
   */
  storage_path:   string | null;
  config_json:    TemplateField[];
  is_active:      boolean;
  created_at:     string;
  updated_at:     string;
}

// ── API payloads ──────────────────────────────────────────────────────────────

/**
 * Body accepted by POST /api/admin/post-templates (create).
 * `id`, `created_at`, `updated_at` are generated by the database.
 */
export interface CreateTemplatePayload {
  name:           string;
  platform:       TemplatePlatform;
  verdict:        TemplateVerdict;
  canvas_width:   number;
  canvas_height:  number;
  /** Path relative to the template-assets bucket root. e.g. "backgrounds/facebook-false.png" */
  storage_path?:  string | null;
  config_json?:   TemplateField[];
  is_active?:     boolean;
}

/**
 * Body accepted by PATCH /api/admin/post-templates/:id (partial update).
 * All fields are optional — only provided fields are changed.
 */
export type UpdateTemplatePayload = Partial<CreateTemplatePayload>;

/**
 * Query params accepted by GET /api/admin/post-templates (list).
 */
export interface ListTemplatesQuery {
  /** Filter by platform. Omit to return all platforms. */
  platform?: TemplatePlatform;
  /** Filter by verdict. Omit to return all verdicts. */
  verdict?:  TemplateVerdict;
  /** Filter by active state. Omit to return both active and inactive. */
  is_active?: boolean;
}

/**
 * Standard list response envelope returned by GET /api/admin/post-templates.
 */
export interface TemplateListResponse {
  data:  PostTemplate[];
  count: number;
}

// ── Type guards ───────────────────────────────────────────────────────────────

const PLATFORMS  = new Set<string>(["facebook", "instagram", "story"]);
const VERDICTS   = new Set<string>(["true", "false", "misleading", "unverified"]);
const FIELD_TYPES = new Set<string>([
  "text", "claim", "verdict", "confidence", "date", "list", "sources", "image", "qr_code", "logo",
]);

export function isTemplatePlatform(v: unknown): v is TemplatePlatform {
  return typeof v === "string" && PLATFORMS.has(v);
}

export function isTemplateVerdict(v: unknown): v is TemplateVerdict {
  return typeof v === "string" && VERDICTS.has(v);
}

export function isFieldType(v: unknown): v is FieldType {
  return typeof v === "string" && FIELD_TYPES.has(v);
}

/** Minimal shape check for an inbound CreateTemplatePayload. */
export function isCreateTemplatePayload(v: unknown): v is CreateTemplatePayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.name         === "string" &&
    isTemplatePlatform(p.platform)     &&
    isTemplateVerdict(p.verdict)       &&
    typeof p.canvas_width  === "number" &&
    typeof p.canvas_height === "number"
  );
}
