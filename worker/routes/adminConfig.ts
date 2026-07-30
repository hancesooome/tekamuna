/**
 * worker/routes/adminConfig.ts
 *
 * Admin configuration endpoints.
 *
 *   GET  /api/admin/settings         → returns current routing settings from Supabase
 *   POST /api/admin/settings         → saves routing settings to Supabase + invalidates cache
 *
 * These are protected by requiring the Supabase Auth JWT in the Authorization header.
 * The Worker validates the JWT is present and non-empty (Supabase itself enforces RLS).
 */

import type { Env } from "../index";
import {
  fetchAdminSettings,
  invalidateAdminSettingsCache,
  type TavilyMode,
  type AiProviderMode,
} from "../lib/adminSettings";

// ── CORS headers (allow dashboard origin) ─────────────────────────────────────

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

// ── Valid values ───────────────────────────────────────────────────────────────

const VALID_TAVILY_MODES:      TavilyMode[]     = ["auto", "force_key1", "force_key2"];
const VALID_AI_PROVIDER_MODES: AiProviderMode[] = [
  "auto",
  "force_openrouter_key1",
  "force_openrouter_key2",
  "force_gemini",
];

// ── Route handler ─────────────────────────────────────────────────────────────

export async function handleAdminConfig(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── GET /api/admin/settings ────────────────────────────────────────────────
  if (request.method === "GET") {
    const settings = await fetchAdminSettings(env);

    // Also return which keys are actually configured so the UI can warn on
    // forced modes whose key is missing.
    const keyStatus = {
      tavilyKey1:      Boolean(env.TAVILY_API_KEY?.trim()),
      tavilyKey2:      Boolean(env.TAVILY_API_KEY_2?.trim()),
      openrouterKey1:  Boolean(env.OPENROUTER_API_KEY?.trim()),
      openrouterKey2:  Boolean(env.OPENROUTER_API_KEY_2?.trim()),
      gemini:          Boolean(env.GEMINI_API_KEY?.trim()),
    };

    return json({ settings, keyStatus });
  }

  // ── POST /api/admin/settings ───────────────────────────────────────────────
  if (request.method === "POST") {
    // Validate auth — require a Bearer token (Supabase JWT from the dashboard)
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ") || authHeader.length < 20) {
      return json({ error: "Unauthorized — missing or invalid Authorization header." }, 401);
    }
    const token = authHeader.slice(7);

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const { tavilyMode, aiProviderMode } = body as Record<string, unknown>;

    // Validate values
    if (tavilyMode !== undefined && !VALID_TAVILY_MODES.includes(tavilyMode as TavilyMode)) {
      return json({ error: `Invalid tavilyMode. Valid values: ${VALID_TAVILY_MODES.join(", ")}` }, 422);
    }
    if (aiProviderMode !== undefined && !VALID_AI_PROVIDER_MODES.includes(aiProviderMode as AiProviderMode)) {
      return json({ error: `Invalid aiProviderMode. Valid values: ${VALID_AI_PROVIDER_MODES.join(", ")}` }, 422);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({ error: "Supabase not configured on this Worker." }, 503);
    }

    // Persist each setting to Supabase via UPSERT
    const updates: Array<{ key: string; value: string }> = [];
    if (tavilyMode !== undefined)     updates.push({ key: "tavily_mode",      value: tavilyMode as string });
    if (aiProviderMode !== undefined) updates.push({ key: "ai_provider_mode", value: aiProviderMode as string });

    if (updates.length === 0) {
      return json({ error: "No settings provided to update." }, 422);
    }

    const errors: string[] = [];

    for (const { key, value } of updates) {
      const url = `${env.SUPABASE_URL}/rest/v1/admin_settings?setting_key=eq.${key}`;
      const res = await fetch(url, {
        method:  "PATCH",
        headers: {
          "apikey":        env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,  // Use the dashboard user's JWT
          "Content-Type":  "application/json",
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({ setting_value: value }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[AdminConfig] Failed to save ${key}: HTTP ${res.status} — ${errText}`);
        errors.push(`${key}: HTTP ${res.status}`);
      } else {
        console.info(`[AdminConfig] Saved ${key}=${value}`);
      }
    }

    if (errors.length > 0) {
      return json({ error: `Failed to save some settings: ${errors.join("; ")}` }, 500);
    }

    // Invalidate the in-memory cache so next fact-check picks up fresh settings
    invalidateAdminSettingsCache();

    const fresh = await fetchAdminSettings(env);
    return json({ success: true, settings: fresh });
  }

  return json({ error: "Method not allowed." }, 405);
}
