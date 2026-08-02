/**
 * worker/routes/fieldDefaults.ts
 *
 * GET/POST /api/admin/field-defaults
 *
 * Stores per-field-type style defaults in the admin_settings table so they
 * persist across devices and browsers.
 *
 *   GET  → { defaults: Record<FieldType, Partial<TemplateField>> }
 *   POST → body: { defaults: {...} } → { ok: true }
 */

import type { Env } from "../index";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleFieldDefaults(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: "Supabase not configured." }, 503);
  }

  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) {
    return json({ error: "Unauthorized." }, 401);
  }
  const token = auth.slice(7);

  // ── GET ────────────────────────────────────────────────────────────────────
  if (request.method === "GET") {
    const url = `${env.SUPABASE_URL}/rest/v1/admin_settings?setting_key=eq.field_defaults&select=setting_value`;
    const res = await fetch(url, {
      headers: {
        "apikey":        env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) return json({ defaults: {} });
    const rows = await res.json() as { setting_value: string }[];
    if (!rows.length) return json({ defaults: {} });
    try {
      return json({ defaults: JSON.parse(rows[0].setting_value) });
    } catch {
      return json({ defaults: {} });
    }
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (request.method === "POST") {
    let body: unknown;
    try { body = await request.json(); } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const { defaults } = body as Record<string, unknown>;
    if (!defaults || typeof defaults !== "object") {
      return json({ error: "Body must be { defaults: {...} }." }, 422);
    }

    const value = JSON.stringify(defaults);

    // Try PATCH first (update existing row)
    const patchUrl = `${env.SUPABASE_URL}/rest/v1/admin_settings?setting_key=eq.field_defaults`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        "apikey":        env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify({ setting_value: value }),
    });

    // If no row was updated (204 but Content-Range: */0), INSERT instead
    const contentRange = patchRes.headers.get("Content-Range") ?? "";
    if (patchRes.ok && contentRange.endsWith("/0")) {
      const insertUrl = `${env.SUPABASE_URL}/rest/v1/admin_settings`;
      await fetch(insertUrl, {
        method: "POST",
        headers: {
          "apikey":        env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type":  "application/json",
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({ setting_key: "field_defaults", setting_value: value }),
      });
    }

    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
}
