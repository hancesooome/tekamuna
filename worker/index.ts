/// <reference types="@cloudflare/workers-types" />

/**
 * Teka Muna — Cloudflare Worker entry point
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

import { handleVerify }       from "./routes/verify";
import { handleSearch }       from "./routes/search";
import { handleAnalyzeImage } from "./routes/analyzeImage";

export interface Env {
  // ── Required ──────────────────────────────────────────────────────────────
  TAVILY_API_KEY: string;

  // ── AI providers (at least one required) ──────────────────────────────────
  OPENROUTER_API_KEY?:   string;
  OPENROUTER_API_KEY_2?: string;  // second key, used when first is rate-limited
  GEMINI_API_KEY?:       string;

  // ── Per-task model overrides (optional) ───────────────────────────────────
  MODELS_VERDICT?:             string;
  MODELS_EVIDENCE_EXTRACTION?: string;
  MODELS_SUMMARY?:             string;
  MODELS_SEARCH_QUERY?:        string;
  MODELS_TRANSLATION?:         string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── CORS preflight ─────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── POST /api/verify ───────────────────────────────────────────────────
    if (url.pathname === "/api/verify" && request.method === "POST") {
      return handleVerify(request, env);
    }

    // ── GET /api/search?q=... ──────────────────────────────────────────────
    if (url.pathname === "/api/search" && request.method === "GET") {
      return handleSearch(request, env);
    }

    // ── POST /api/analyze-image ────────────────────────────────────────────
    if (url.pathname === "/api/analyze-image" && request.method === "POST") {
      return handleAnalyzeImage(request, env);
    }

    // ── GET /api/health ────────────────────────────────────────────────────
    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(
        {
          ok:  true,
          ts:  Date.now(),
          services: {
            tavily:       env.TAVILY_API_KEY      ? "configured" : "missing",
            openrouter:   env.OPENROUTER_API_KEY   ? "configured" : "missing",
            openrouter2:  env.OPENROUTER_API_KEY_2 ? "configured" : "missing",
            gemini:       env.GEMINI_API_KEY       ? "configured" : "missing",
          },
          modelOverrides: {
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

    return jsonResponse({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;
