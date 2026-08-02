/// <reference types="@cloudflare/workers-types" />
// ↑ Tells TypeScript about Cloudflare Workers-specific globals:
//   Request, Response, fetch(), URL, etc.
//   Without this, TypeScript wouldn't know about Worker runtime APIs.

/**
 * Teka Muna — Cloudflare Worker entry point
 *
 * This file is the ONLY entry point for the backend.
 * Cloudflare Workers runs this file on their global edge network —
 * NOT on a traditional server. Every request triggers the fetch() handler below.
 *
 * Think of it like: instead of Express/Node.js, we have a single fetch() function
 * that receives HTTP requests and returns HTTP responses.
 *
 * Routing table:
 *   POST /api/verify         → claim verification pipeline
 *   GET  /api/search?q=...   → raw Tavily search results
 *   GET  /api/health         → liveness + AI provider status
 *
 * ── AI Provider configuration ─────────────────────────────────────────────────
 * Set these secrets via: wrangler secret put <KEY>
 * Or locally in .dev.vars.
 *
 * Required:
 *   OPENROUTER_API_KEY   — OpenRouter API key (free models available)
 *   TAVILY_API_KEY       — Tavily web search API key
 *
 * Optional:
 *   GEMINI_API_KEY       — Direct Gemini API key (additional fallback)
 *
 * Optional model overrides (comma-separated model IDs in priority order):
 *   MODELS_VERDICT             — override models for verdict task
 *   MODELS_EVIDENCE_EXTRACTION — override models for evidence extraction
 *   MODELS_SUMMARY             — override models for summary task
 *   MODELS_SEARCH_QUERY        — override models for search query generation
 *   MODELS_TRANSLATION         — override models for translation
 *
 * Example .dev.vars:
 *   MODELS_VERDICT=deepseek/deepseek-chat:free,qwen/qwen3-32b:free
 */

// ── Route handlers ─────────────────────────────────────────────────────────
// Each handler is in its own file in /routes/ to keep this file clean.
// They receive the raw Request and the Env (env vars/secrets) and return a Response.
import { handleVerify }         from "./routes/verify";         // POST /api/verify
import { handleSearch }         from "./routes/search";         // GET  /api/search
import { handleAnalyzeImage }   from "./routes/analyzeImage";   // POST /api/analyze-image
import { handleOCRExtract }     from "./routes/ocrExtract";     // POST /api/ocr-extract
import { handleStats }          from "./routes/stats";          // GET  /api/stats/*
import { handleAdminConfig }    from "./routes/adminConfig";    // GET/POST /api/admin/settings
import { handlePostTemplates }  from "./routes/postTemplates";  // CRUD /api/admin/post-templates
import { handleUploadImage }    from "./routes/uploadImage";    // POST /api/admin/upload-image
import { handleOgStore, handleOgImage, handleOgPreview } from "./routes/og";

// ── Env interface ─────────────────────────────────────────────────────────────
// Cloudflare Workers passes secrets/bindings through an `env` object.
// We define the shape here so TypeScript catches typos like env.TAVLY_API_KEY.
// These values are set in .dev.vars (local) or via `wrangler secret put` (production).
export interface Env {
  // ── Required ──────────────────────────────────────────────────────────────
  TAVILY_API_KEY: string;         // Required for web search (Tavily)
  TAVILY_API_KEY_2?: string;       // Secondary Tavily key (fallback if primary hits quota)

  // ── AI providers (at least one required) ──────────────────────────────────
  OPENROUTER_API_KEY?:   string;  // Primary OpenRouter key (free models available)
  OPENROUTER_API_KEY_2?: string;  // Second key — used when first hits rate limits
  GEMINI_API_KEY?:       string;  // Direct Gemini API (fallback if OpenRouter exhausted)
  // ? = optional — Worker still starts if these are absent, but AI won't work

  // ── Per-task model overrides (optional) ───────────────────────────────────
  // These allow changing which AI models are used WITHOUT redeploying code.
  // Format: comma-separated model IDs in priority order.
  // Example: "deepseek/deepseek-chat:free,qwen/qwen3-32b:free"
  MODELS_VERDICT?:             string;
  MODELS_EVIDENCE_EXTRACTION?: string;
  MODELS_SUMMARY?:             string;
  MODELS_SEARCH_QUERY?:        string;
  MODELS_TRANSLATION?:         string;

  // ── OCR ───────────────────────────────────────────────────────────────────
  OCR_SPACE_API_KEY?: string;  // OCR.Space API key — used by /api/ocr-extract

  // ── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL?:               string;  // e.g. https://xxx.supabase.co
  SUPABASE_ANON_KEY?:          string;  // Supabase anon key — safe for server-side reads
  SUPABASE_SERVICE_ROLE_KEY?:  string;  // Service role key — bypasses RLS for admin writes
}

// ── CORS headers ──────────────────────────────────────────────────────────────
// CORS (Cross-Origin Resource Sharing) controls which origins can call our API.
// "*" means any website can call our API — appropriate for a public fact-checker.
// Without these headers, the browser blocks frontend → Worker API calls.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-tavily-preference",
};

// ── Helper: create a JSON response ───────────────────────────────────────────
// Workers return raw Response objects (not res.json() like Express).
// This helper wraps any value into a JSON response with the right headers.
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    // ...CORS_HEADERS spreads (copies) all CORS key-value pairs into the headers object
  });
}

// ── Default export: the Worker handler ───────────────────────────────────────
// Cloudflare Workers requires a default export with a `fetch` method.
// Every HTTP request to your Worker domain triggers this function.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Parse the URL once so we can check pathname and search params.
    const url = new URL(request.url);
    // e.g. url.pathname = "/api/verify", url.search = "?q=marcos"

    // ── CORS preflight ─────────────────────────────────────────────────────
    // Browsers send an OPTIONS "preflight" request before POST/PUT to check
    // if CORS is allowed. We must respond 204 (No Content) with the CORS headers.
    // If we don't handle this, the browser blocks the actual request.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Open Graph (social link previews) ─────────────────────────────────
    if (url.pathname === "/api/og/store" && request.method === "POST") {
      return handleOgStore(request, env);
    }
    if (url.pathname === "/api/og/image" && request.method === "GET") {
      return handleOgImage(request, env);
    }
    if (url.pathname === "/api/og/preview" && request.method === "GET") {
      return handleOgPreview(request, env);
    }

    // ── POST /api/verify ───────────────────────────────────────────────────
    // The main fact-checking endpoint. Runs: Tavily search → AI analysis → verdict.
    if (url.pathname === "/api/verify" && request.method === "POST") {
      return handleVerify(request, env, ctx);
    }

    // ── GET /api/search?q=... ──────────────────────────────────────────────
    // Raw Tavily search endpoint. Returns search results without AI analysis.
    // Useful for debugging or if the frontend wants to show raw search results.
    if (url.pathname === "/api/search" && request.method === "GET") {
      return handleSearch(request, env);
    }

    // ── POST /api/analyze-image ────────────────────────────────────────────
    // Accepts a multipart image upload, runs OCR + AI to extract the claim.
    if (url.pathname === "/api/analyze-image" && request.method === "POST") {
      return handleAnalyzeImage(request, env);
    }

    // ── POST /api/ocr-extract ──────────────────────────────────────────────
    // Accepts a multipart image upload, runs OCR.Space, returns cleaned text.
    // Cheaper than analyze-image (no AI) — lets the user review text before verify.
    if (url.pathname === "/api/ocr-extract" && request.method === "POST") {
      return handleOCRExtract(request, env);
    }

    // ── /api/stats/* (GET, POST) ─────────────────────────────────────────────
    if (url.pathname.startsWith("/api/stats")) {
      return handleStats(request, env);
    }

    // ── POST /api/admin/upload-image ──────────────────────────────────────────
    // Proxies image upload to Supabase Storage, returns storage path.
    // Must sit before the /api/admin/post-templates and /api/admin catch-alls.
    if (url.pathname === "/api/admin/upload-image" && request.method === "POST") {
      return handleUploadImage(request, env);
    }

    // ── /api/admin/field-defaults (GET, POST) ─────────────────────────────────
    // Stores/retrieves per-field-type style defaults in admin_settings.
    // Must sit before the /api/admin catch-all.
    if (url.pathname === "/api/admin/field-defaults") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }});
      }
      return handleFieldDefaults(request, env);
    }

    // ── /api/admin/post-templates (GET, POST, PATCH, DELETE) ─────────────────
    // Template CRUD — must be matched BEFORE the /api/admin catch-all below.
    if (url.pathname.startsWith("/api/admin/post-templates")) {
      return handlePostTemplates(request, env);
    }

    // ── /api/admin/settings (GET, POST) ───────────────────────────────────────
    // Admin routing configuration — reads/writes the Supabase admin_settings table.
    if (url.pathname.startsWith("/api/admin")) {
      return handleAdminConfig(request, env);
    }

    // ── GET /api/health ────────────────────────────────────────────────────
    // Health check endpoint — tells you which API keys are configured.
    // Useful for debugging without exposing the actual key values.
    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(
        {
          ok:  true,                  // simple liveness check
          ts:  Date.now(),            // Unix timestamp in milliseconds
          services: {
            // For each key: "configured" if set and non-empty, "missing" if absent
            tavily:      env.TAVILY_API_KEY      ? "configured" : "missing",
            openrouter:  env.OPENROUTER_API_KEY   ? "configured" : "missing",
            openrouter2: env.OPENROUTER_API_KEY_2 ? "configured" : "missing",
            gemini:      env.GEMINI_API_KEY       ? "configured" : "missing",
            ocr:         env.OCR_SPACE_API_KEY    ? "configured" : "missing",
          },
          modelOverrides: {
            // ?? "default" → use "default" if the env var is undefined/null
            VERDICT:             env.MODELS_VERDICT             ?? "(default)",
            EVIDENCE_EXTRACTION: env.MODELS_EVIDENCE_EXTRACTION ?? "(default)",
            SUMMARY:             env.MODELS_SUMMARY             ?? "(default)",
            SEARCH_QUERY:        env.MODELS_SEARCH_QUERY        ?? "(default)",
            TRANSLATION:         env.MODELS_TRANSLATION         ?? "(default)",
          },
        },
        200,
      );
    }

    // ── 404 fallback ───────────────────────────────────────────────────────
    // Any request that didn't match the routes above gets a 404 error.
    return jsonResponse({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;
// `satisfies ExportedHandler<Env>` is TypeScript validation:
// it checks that our default export has the correct shape for a Cloudflare Worker
// without changing its inferred type. Better than `as ExportedHandler<Env>` (which
// would bypass type errors) or leaving it untyped.

// ── /api/admin/field-defaults ─────────────────────────────────────────────────
// Stores per-field-type style defaults in the admin_settings table so they
// persist across devices and browsers.
//
//   GET  /api/admin/field-defaults
//     → { defaults: Record<FieldType, Partial<TemplateField>> }
//
//   POST /api/admin/field-defaults
//     Body: { defaults: Record<FieldType, Partial<TemplateField>> }
//     → { ok: true }

const FIELD_DEFAULTS_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function fdJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...FIELD_DEFAULTS_CORS },
  });
}

async function handleFieldDefaults(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return fdJson({ error: "Supabase not configured." }, 503);
  }

  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) {
    return fdJson({ error: "Unauthorized." }, 401);
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
    if (!res.ok) return fdJson({ defaults: {} });
    const rows = await res.json() as { setting_value: string }[];
    if (!rows.length) return fdJson({ defaults: {} });
    try {
      return fdJson({ defaults: JSON.parse(rows[0].setting_value) });
    } catch {
      return fdJson({ defaults: {} });
    }
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (request.method === "POST") {
    let body: unknown;
    try { body = await request.json(); } catch {
      return fdJson({ error: "Invalid JSON." }, 400);
    }
    const { defaults } = body as Record<string, unknown>;
    if (!defaults || typeof defaults !== "object") {
      return fdJson({ error: "Body must be { defaults: {...} }." }, 422);
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

    return fdJson({ ok: true });
  }

  return fdJson({ error: "Method not allowed." }, 405);
}
