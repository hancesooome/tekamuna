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
// Env is the TypeScript interface defining all available environment variables/secrets.
// Importing `type` means this import is erased at compile time — zero runtime cost.

import { searchWeb }       from "../services/tavily";
// searchWeb(query, apiKey) → hits Tavily's search API, returns SearchResult[]

import { analyseEvidence } from "../services/gemini";
// analyseEvidence(input) → runs the AI verdict pipeline, returns VerifyResult

import type { VerifyRequest } from "../../src/types/verify";
// VerifyRequest = { claim: string; category?: string }
// The shape of the JSON body we expect from the frontend.
import { shouldRunVerificationPipeline } from "../../src/utils/intent";
import { apiLogger } from "../lib/apiLogger";
// apiLogger — used to apply the per-request Tavily key preference forwarded
// via the x-tavily-preference header. Workers are stateless so we cannot rely
// on a previously-stored preference surviving across requests.

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
    `[fact-check-intent] Claim: "${cleanClaim}" | Route: ${detection.shouldVerify ? "PIPELINE" : "NORMAL_CHAT"} | Confidence: ${detection.confidence.toFixed(2)} | Reason: ${detection.reason}`,
  );
  if (!detection.shouldVerify) {
    return json(
      {
        error: detection.reason,
        shouldVerify: false,
        confidence: detection.confidence,
      },
      422,
    );
  }

  // ── 2. Tavily web search ─────────────────────────────────────────────────
  // Workers are stateless — each request is a fresh isolate. We cannot rely
  // on a previously-stored Tavily preference surviving from a prior request.
  // The frontend forwards the user's preference as the x-tavily-preference
  // header on every verify call, so we read and apply it here each time.
  const tavilyPrefHeader = request.headers.get("x-tavily-preference");
  if (tavilyPrefHeader === "key1" || tavilyPrefHeader === "key2" || tavilyPrefHeader === "auto") {
    apiLogger.setTavilyPreference(tavilyPrefHeader);
    console.log(`[Tavily] Preference set from header: ${tavilyPrefHeader}`);
  }

  // searchWeb returns an array of SearchResult objects (up to 10).
  // If Tavily fails or the key is missing, it returns [] (empty array) — never throws.
  const searchResults = await searchWeb(
    cleanClaim,
    env.TAVILY_API_KEY,
    env.TAVILY_API_KEY_2,
  );

  // ── 3. AI analysis via AIManager ─────────────────────────────────────────
  // analyseEvidence orchestrates:
  //   - Credibility scoring of all Tavily results
  //   - Building the AI prompt from the top-ranked sources
  //   - Calling the AI (OpenRouter → Gemini fallback if rate-limited)
  //   - Assembling the final VerifyResult
  //
  // We pass `env as unknown as Record<string, string | undefined>` so AIManager
  // can read MODELS_* env vars at runtime without knowing the exact Env type.
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
  // Send the VerifyResult as a 200 JSON response.
  // The frontend's verifyClaim() in src/services/api.ts reads this.
  return json(result, 200);
}
