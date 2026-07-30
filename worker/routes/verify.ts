/**
 * POST /api/verify
 *
 * This is the main fact-checking endpoint.
 * It receives a claim from the frontend and returns a full VerifyResult.
 *
 * Request body: { claim: string; category?: string }
 * Response:     VerifyResult (see src/types/verify.ts)
 *
 * Pipeline — what happens step by step:
 *   1. Parse & validate the request body
 *   2. Search the web via Tavily (retrieves up to 10 relevant articles)
 *   3. Run AI analysis via AIManager (OpenRouter free models → Gemini fallback)
 *   4. Return the assembled VerifyResult as JSON
 */

import type { Env } from "../index";
import { searchWeb }       from "../services/tavily";
import { analyseEvidence } from "../services/gemini";
import type { VerifyRequest } from "../../src/types/verify";
import { shouldRunVerificationPipeline } from "../../src/utils/intent";
import { fetchAdminSettings } from "../lib/adminSettings";
// fetchAdminSettings reads routing config from Supabase (cached 60s per isolate).
// It determines which Tavily key to use and which AI provider to force.

// ── Local helpers ─────────────────────────────────────────────────────────────

// CORS headers allow the browser on the frontend domain to call this Worker.
// Without "Access-Control-Allow-Origin", the browser blocks the response.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
};

/**
 * Creates a JSON HTTP Response with optional status code.
 * Workers return raw Response objects (not Express-style res.json()).
 *
 * @param data   Any value — gets JSON-stringified for the body
 * @param status HTTP status code (default: 200 OK)
 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    // JSON.stringify(data) converts the JS object to a JSON string
    // "Content-Type: application/json" tells the browser how to parse the body
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function handleVerify(request: Request, env: Env): Promise<Response> {

  // ── 1. Parse & validate ─────────────────────────────────────────────────
  // request.json() parses the HTTP request body as JSON.
  // It can throw if the body isn't valid JSON (e.g. empty body, malformed JSON).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Return 400 Bad Request if the body can't be parsed.
    return json({ error: "Invalid JSON body." }, 400);
  }

  // Destructure `claim` and `category` from the parsed body.
  // We cast to Partial<VerifyRequest> because we don't trust the client yet —
  // Partial<T> makes all fields optional so TypeScript doesn't assume they exist.
  const { claim, category } = body as Partial<VerifyRequest>;

  // Validate `claim`: must exist, be a string, and be at least 5 characters.
  // claim.trim() removes leading/trailing whitespace before checking length.
  if (!claim || typeof claim !== "string" || claim.trim().length < 5) {
    return json(
      { error: "Field `claim` is required and must be at least 5 characters." },
      422, // 422 Unprocessable Entity = request was understood but has validation errors
    );
  }

  // Validate maximum length to prevent abuse (very long prompts waste AI quota).
  if (claim.trim().length > 1000) {
    return json({ error: "Field `claim` must not exceed 1000 characters." }, 422);
  }

  // Sanitised versions: remove accidental leading/trailing spaces.
  // || undefined → if category is empty string "", treat as undefined (not set)
  const cleanClaim    = claim.trim();
  const cleanCategory = category?.trim() || undefined;
  // Optional chaining `category?.trim()`: if category is undefined, returns undefined
  // instead of throwing "Cannot read properties of undefined".

  // ── 1.5 Intent detection ──────────────────────────────────────────────────
  const detection = shouldRunVerificationPipeline(cleanClaim);
  console.log(
    `[fact-check-intent] Claim: "${cleanClaim}" | Route: ${detection.shouldVerify ? "PIPELINE" : "NORMAL_CHAT"} | Detection Confidence: ${detection.detectionConfidence.toFixed(2)} | Reason: ${detection.reason}`,
  );
  if (!detection.shouldVerify) {
    return json(
      {
        error: detection.reason,
        shouldVerify: false,
        detectionConfidence: detection.detectionConfidence,
        // Kept for backward compatibility in case any old client expects it
        confidence: detection.detectionConfidence,
      },
      422,
    );
  }

  // ── 2. Load admin settings & determine routing ──────────────────────────
  // Settings are fetched from Supabase and cached for 60 seconds per isolate.
  // Falls back to 'auto' defaults if Supabase is unreachable.
  const adminSettings = await fetchAdminSettings(env);
  const { tavilyMode, aiProviderMode } = adminSettings;

  console.info(
    `[Verify] Routing: tavily_mode=${tavilyMode} | ai_provider_mode=${aiProviderMode}`,
  );

  // Safety check: if a forced provider is selected but its key is missing,
  // reject the request before wasting quota on the search step.
  if (tavilyMode === "force_key1" && !env.TAVILY_API_KEY?.trim()) {
    return json({ error: "Admin configuration error: Tavily Key 1 is forced but not configured in the Worker secrets." }, 503);
  }
  if (tavilyMode === "force_key2" && !env.TAVILY_API_KEY_2?.trim()) {
    return json({ error: "Admin configuration error: Tavily Key 2 is forced but not configured in the Worker secrets." }, 503);
  }
  if (aiProviderMode === "force_openrouter_key1" && !env.OPENROUTER_API_KEY?.trim()) {
    return json({ error: "Admin configuration error: OpenRouter Key 1 is forced but not configured in the Worker secrets." }, 503);
  }
  if (aiProviderMode === "force_openrouter_key2" && !env.OPENROUTER_API_KEY_2?.trim()) {
    return json({ error: "Admin configuration error: OpenRouter Key 2 is forced but not configured in the Worker secrets." }, 503);
  }
  if (aiProviderMode === "force_gemini" && !env.GEMINI_API_KEY?.trim()) {
    return json({ error: "Admin configuration error: Gemini is forced but not configured in the Worker secrets." }, 503);
  }

  // ── 3. Tavily web search ─────────────────────────────────────────────────
  // searchWeb accepts the resolved tavilyMode so it never reads from global state.
  const searchResults = await searchWeb(
    cleanClaim,
    env.TAVILY_API_KEY,
    env.TAVILY_API_KEY_2,
    tavilyMode,
  );

  // ── 4. AI analysis via AIManager ─────────────────────────────────────────
  const result = await analyseEvidence({
    claim:             cleanClaim,
    category:          cleanCategory,
    searchResults,
    geminiApiKey:      env.GEMINI_API_KEY,
    openRouterApiKey:  env.OPENROUTER_API_KEY,
    openRouterApiKey2: env.OPENROUTER_API_KEY_2,
    envVars:           env as unknown as Record<string, string | undefined>,
    aiProviderMode,
  });

  // ── 5. Return ────────────────────────────────────────────────────────────
  return json(result, 200);
}
