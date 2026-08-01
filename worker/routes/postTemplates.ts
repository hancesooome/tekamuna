/**
 * worker/routes/postTemplates.ts
 *
 * REST route handler for post template management.
 *
 * Routing table (all paths under /api/admin/post-templates):
 *
 *   GET    /api/admin/post-templates
 *     ?platform=facebook|instagram|story   (optional filter)
 *     ?verdict=true|false|misleading|unverified (optional filter)
 *     ?is_active=true|false                (optional filter)
 *     → TemplateListResponse  { data: PostTemplate[], count: number }
 *
 *   GET    /api/admin/post-templates/:id
 *     → PostTemplate
 *
 *   GET    /api/admin/post-templates/active?platform=...&verdict=...
 *     → PostTemplate  (the single active template for a platform+verdict pair)
 *
 *   POST   /api/admin/post-templates
 *     Body: CreateTemplatePayload
 *     → PostTemplate  (the created row)
 *
 *   PATCH  /api/admin/post-templates/:id
 *     Body: UpdateTemplatePayload  (partial — only sent fields are changed)
 *     → PostTemplate  (the updated row)
 *
 *   PATCH  /api/admin/post-templates/:id/toggle
 *     Body: { is_active: boolean }
 *     → PostTemplate  (the updated row)
 *
 *   DELETE /api/admin/post-templates/:id
 *     → { deleted: true }
 *
 * Auth:
 *   GET /active  — public (anon key, RLS enforced — only active templates readable)
 *   All other methods — require Authorization: Bearer <supabase-jwt>
 *
 * The handler is intentionally routed BEFORE the existing /api/admin catch-all
 * in index.ts so /api/admin/post-templates is handled here and only
 * /api/admin/settings falls through to handleAdminConfig.
 */

import type { Env } from "../index";
import {
  listTemplates,
  getTemplateById,
  getTemplateFor,
  createTemplate,
  updateTemplate,
  toggleActive,
  deleteTemplate,
} from "../services/postTemplates";
import {
  isTemplatePlatform,
  isTemplateVerdict,
  isCreateTemplatePayload,
} from "../../src/types/postTemplate";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/**
 * Validates that the request carries a non-empty Supabase Bearer JWT.
 * Returns the token string on success, or a 401 Response on failure.
 * We do not verify the JWT signature here — Supabase RLS handles that.
 * The Worker just ensures the header is present so the Supabase call is
 * made with the user's credentials rather than the anon key.
 */
function requireAuth(request: Request): string | Response {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) {
    return json({ error: "Unauthorized — missing or invalid Authorization header." }, 401);
  }
  return auth.slice(7); // return the token
}

/**
 * Extract the UUID segment after the base path, e.g.:
 *   /api/admin/post-templates/abc-123       → "abc-123"
 *   /api/admin/post-templates/abc-123/toggle → "abc-123"  (suffix stripped)
 * Returns null when the path has no ID segment.
 */
function extractId(pathname: string): string | null {
  // pathname: /api/admin/post-templates[/id[/suffix]]
  const parts = pathname.replace(/\/$/, "").split("/");
  // parts: ["", "api", "admin", "post-templates", <id?>, <suffix?>]
  const id = parts[4] ?? null;
  // Ignore known non-UUID sub-paths like "active"
  if (!id || id === "active") return null;
  return id;
}

/**
 * Extract the optional trailing sub-path segment, e.g.:
 *   /api/admin/post-templates/abc-123/toggle → "toggle"
 *   /api/admin/post-templates/abc-123        → null
 */
function extractSuffix(pathname: string): string | null {
  const parts = pathname.replace(/\/$/, "").split("/");
  return parts[5] ?? null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function handlePostTemplates(
  request: Request,
  env: Env,
): Promise<Response> {
  const url      = new URL(request.url);
  const pathname = url.pathname; // e.g. /api/admin/post-templates/abc/toggle
  const method   = request.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const id     = extractId(pathname);
  const suffix = extractSuffix(pathname);

  // ── GET /api/admin/post-templates/active?platform=...&verdict=... ──────────
  // Public endpoint — no auth required. Used by the share-image renderer.
  if (method === "GET" && pathname.endsWith("/active")) {
    const platform = url.searchParams.get("platform");
    const verdict  = url.searchParams.get("verdict");

    if (!platform || !isTemplatePlatform(platform)) {
      return json({ error: "Query param `platform` is required. Valid: facebook, instagram, story." }, 422);
    }
    if (!verdict || !isTemplateVerdict(verdict)) {
      return json({ error: "Query param `verdict` is required. Valid: true, false, misleading, unverified." }, 422);
    }

    const result = await getTemplateFor(env, platform, verdict);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result.data);
  }

  // ── GET /api/admin/post-templates/:id ────────────────────────────────────
  if (method === "GET" && id) {
    const result = await getTemplateById(env, id);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result.data);
  }

  // ── GET /api/admin/post-templates ─────────────────────────────────────────
  if (method === "GET" && !id) {
    const platform  = url.searchParams.get("platform")  ?? undefined;
    const verdict   = url.searchParams.get("verdict")   ?? undefined;
    const isActive  = url.searchParams.get("is_active") ?? undefined;

    // Validate optional filters when provided
    if (platform !== undefined && !isTemplatePlatform(platform)) {
      return json({ error: `Invalid platform "${platform}". Valid: facebook, instagram, story.` }, 422);
    }
    if (verdict !== undefined && !isTemplateVerdict(verdict)) {
      return json({ error: `Invalid verdict "${verdict}". Valid: true, false, misleading, unverified.` }, 422);
    }

    const query = {
      ...(platform  !== undefined ? { platform: platform as Parameters<typeof getTemplateFor>[1] } : {}),
      ...(verdict   !== undefined ? { verdict:  verdict  as Parameters<typeof getTemplateFor>[2] } : {}),
      ...(isActive  !== undefined ? { is_active: isActive === "true" } : {}),
    };

    const result = await listTemplates(env, query);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ data: result.data, count: result.data.length });
  }

  // ── All write methods require auth from here ───────────────────────────────
  const tokenOrError = requireAuth(request);
  if (tokenOrError instanceof Response) return tokenOrError;

  // ── POST /api/admin/post-templates ────────────────────────────────────────
  if (method === "POST" && !id) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    if (!isCreateTemplatePayload(body)) {
      return json({
        error: "Invalid payload. Required fields: name (string), platform, verdict, canvas_width (number), canvas_height (number).",
      }, 422);
    }

    // Additional range validation — matches the DB CHECK constraints
    if (body.canvas_width  < 100 || body.canvas_width  > 8000) {
      return json({ error: "canvas_width must be between 100 and 8000." }, 422);
    }
    if (body.canvas_height < 100 || body.canvas_height > 8000) {
      return json({ error: "canvas_height must be between 100 and 8000." }, 422);
    }
    const result = await createTemplate(env, body);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result.data, 201);
  }

  // ── PATCH /api/admin/post-templates/:id/toggle ────────────────────────────
  if (method === "PATCH" && id && suffix === "toggle") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const { is_active } = body as Record<string, unknown>;
    if (typeof is_active !== "boolean") {
      return json({ error: "Body must be { is_active: true } or { is_active: false }." }, 422);
    }

    const result = await toggleActive(env, id, is_active);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result.data);
  }

  // ── PATCH /api/admin/post-templates/:id ──────────────────────────────────
  if (method === "PATCH" && id && !suffix) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const payload = body as Record<string, unknown>;

    // Validate any fields that are present
    if (payload.platform  !== undefined && !isTemplatePlatform(payload.platform)) {
      return json({ error: "Invalid platform. Valid: facebook, instagram, story." }, 422);
    }
    if (payload.verdict !== undefined && !isTemplateVerdict(payload.verdict)) {
      return json({ error: "Invalid verdict. Valid: true, false, misleading, unverified." }, 422);
    }
    if (
      payload.canvas_width !== undefined &&
      (typeof payload.canvas_width !== "number" || payload.canvas_width < 100 || payload.canvas_width > 8000)
    ) {
      return json({ error: "canvas_width must be a number between 100 and 8000." }, 422);
    }
    if (
      payload.canvas_height !== undefined &&
      (typeof payload.canvas_height !== "number" || payload.canvas_height < 100 || payload.canvas_height > 8000)
    ) {
      return json({ error: "canvas_height must be a number between 100 and 8000." }, 422);
    }
    const result = await updateTemplate(env, id, payload);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result.data);
  }

  // ── DELETE /api/admin/post-templates/:id ──────────────────────────────────
  if (method === "DELETE" && id) {
    const result = await deleteTemplate(env, id);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result.data);
  }

  return json({ error: "Method not allowed." }, 405);
}
