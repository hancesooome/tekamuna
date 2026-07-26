/**
 * POST /api/verify
 *
 * Request body: { claim: string; category?: string }
 * Response:     VerifyResult
 *
 * Pipeline:
 *   1. Validate input
 *   2. Search the web via Tavily
 *   3. Run AIManager pipeline (OpenRouter free models → Gemini fallback)
 *   4. Return VerifyResult
 */

import type { Env } from "../index";
import { searchWeb }      from "../services/tavily";
import { analyseEvidence } from "../services/gemini";
import type { VerifyRequest } from "../../src/types/verify";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  // ── 1. Parse & validate ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const { claim, category } = body as Partial<VerifyRequest>;

  if (!claim || typeof claim !== "string" || claim.trim().length < 5) {
    return json(
      { error: "Field `claim` is required and must be at least 5 characters." },
      422,
    );
  }

  if (claim.trim().length > 1000) {
    return json({ error: "Field `claim` must not exceed 1000 characters." }, 422);
  }

  const cleanClaim    = claim.trim();
  const cleanCategory = category?.trim() || undefined;

  // ── 2. Tavily web search ─────────────────────────────────────────────────
  const searchResults = await searchWeb(cleanClaim, env.TAVILY_API_KEY);

  // ── 3. AI analysis via AIManager ─────────────────────────────────────────
  // Pass all env vars so AIManager can pick up MODELS_* overrides at runtime
  const result = await analyseEvidence({
    claim:             cleanClaim,
    category:          cleanCategory,
    searchResults,
    geminiApiKey:      env.GEMINI_API_KEY,
    openRouterApiKey:  env.OPENROUTER_API_KEY,
    openRouterApiKey2: env.OPENROUTER_API_KEY_2,
    envVars:           env as unknown as Record<string, string | undefined>,
  });

  // ── 4. Return ────────────────────────────────────────────────────────────
  return json(result, 200);
}
