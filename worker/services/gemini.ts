/**
 * worker/services/gemini.ts  (rename candidate: analyzeService.ts)
 *
 * Purpose:
 *   Central fact-checking analysis service. Orchestrates the full
 *   verify pipeline: scored source selection → single AI verdict call.
 *
 * Responsibilities:
 *   - Build scored source index from Tavily results
 *   - Select top N sources by credibility for the prompt
 *   - Issue one VERDICT AI call via AIManager (OpenRouter → Gemini fallback)
 *   - Assemble and return a typed VerifyResult
 *   - Return a graceful fallback (with all sources visible) if AI is unavailable
 *
 * Dependencies:
 *   - worker/services/credibility.ts  (scoring)
 *   - worker/ai/AIManager.ts          (model selection & retry)
 *   - src/types/verify.ts             (shared types)
 *
 * Note:
 *   The multi-phase EvidenceExtractor/Merger/PromptBuilder pipeline is
 *   preserved in worker/services/ for future use when paid API quota allows
 *   multiple calls per request. Currently disabled to conserve free-tier quota.
 *
 * When to modify:
 *   - Changing the AI prompt / output schema
 *   - Adjusting how many sources are sent to the verdict model
 *   - Re-enabling the multi-phase extraction pipeline
 */

import type { SearchResult, VerifyResult, Source, Verdict } from "../../src/types/verify";
// Importing only types — erased at compile time, no runtime cost.

import { buildScoredSourceIndex }     from "./credibility";
// buildScoredSourceIndex(searchResults) → Map<url, ScoredSource>
// A Map is like an object but keys can be any type and order is preserved.

import { AIManager, AIExhaustedError } from "../ai/AIManager";
// AIManager       → orchestrates AI calls with provider fallback
// AIExhaustedError → thrown when ALL AI providers are unavailable

import type { AIMessage }              from "../ai/types/index";
// AIMessage → { role: "system" | "user" | "assistant", content: string }
// This is the standard "chat" message format used by OpenAI-compatible APIs.

import { extractJson }                 from "../utils/json";
// extractJson<T>(str) → parses a JSON object from a string, even if surrounded
// by markdown code fences (```json ... ```) that some models add.

export type AnalysisResult = VerifyResult & {
  _persist?: boolean;
  _aiModelUsed?: string;
};

// ── Public input type ─────────────────────────────────────────────────────────
// This is what handleVerify passes into analyseEvidence().
export interface AnalyseInput {
  claim:             string;             // The factual claim to verify
  category?:         string;             // Optional category hint (e.g. "Pulitika")
  searchResults:     SearchResult[];     // Raw results from Tavily
  geminiApiKey?:     string | undefined; // Direct Gemini API key (fallback)
  openRouterApiKey?: string | undefined; // Primary OpenRouter key
  openRouterApiKey2?:string | undefined; // Second OpenRouter key (used when first is rate-limited)
  envVars?:          Record<string, string | undefined>; // All env vars for MODELS_* overrides
  aiProviderMode?:   string;             // Mapped forced provider from admin settings
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps the AI's reported confidence to a realistic range based on source count.
 * The AI tends to be overconfident — this prevents misleading high confidence
 * when there's very little evidence.
 *
 * @param confidence     Raw confidence from the AI (0–100)
 * @param relevantSources Number of Tavily results retrieved
 * @returns              Clamped confidence value
 */
function clampConfidence(confidence: number, relevantSources: number): number {
  if (relevantSources === 0) return Math.min(confidence, 40);  // No sources → max 40%
  if (relevantSources === 1) return Math.min(confidence, 70);  // 1 source  → max 70%
  // 2+ sources → allow up to 95%, but never below 30%
  // Math.max(30, Math.min(confidence, 95)) = clamp between [30, 95]
  return Math.max(30, Math.min(confidence, 95));
}

const VALID_VERDICTS = new Set<Verdict>(["true", "false", "misleading", "unverified"]);

/** Parse and validate the minimum verdict contract required by the UI. */
export function parseVerdictContent(
  content: string,
  allowedUrls: ReadonlySet<string>,
): Partial<VerifyResult> {
  const data = extractJson<Partial<VerifyResult>>(content);
  if (!VALID_VERDICTS.has(data.verdict as Verdict)) {
    throw new Error("AI response has an invalid or missing verdict.");
  }
  const confidence = Number(data.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    throw new Error("AI response has an invalid confidence value.");
  }
  if (typeof data.explanation !== "string" || !data.explanation.trim()) {
    throw new Error("AI response has no explanation.");
  }
  if (typeof data.truthStatement !== "string" || !data.truthStatement.trim()) {
    throw new Error("AI response has no truth statement.");
  }
  for (const field of ["supportingEvidence", "contradictingEvidence"] as const) {
    const evidence = data[field];
    if (!Array.isArray(evidence)) {
      throw new Error(`AI response has no ${field} array.`);
    }
    for (const item of evidence) {
      if (!item?.url || !allowedUrls.has(item.url)) {
        throw new Error(`AI response cited an unknown URL in ${field}.`);
      }
    }
  }
  return data;
}

// ── Singleton AIManager ───────────────────────────────────────────────────────
// IMPORTANT: must be module-level so health state persists across requests
// within the same Worker isolate. A new instance per request throws away all
// failure/cooldown tracking, defeating the entire fallback mechanism.
//
// What is a singleton?
//   A singleton is an object that is created ONCE and reused for every future call.
//   Here, _manager is created the first time getManager() is called,
//   then reused for all subsequent requests in the same Worker isolate.

let _manager: AIManager | null = null;
let _managerKeys = "";   // tracks which keys were used to create the singleton

/**
 * Returns the existing AIManager singleton, or creates a new one if:
 *   - It doesn't exist yet (first request)
 *   - The API keys changed (e.g. hot-reloading during development)
 */
function getManager(input: AnalyseInput): AIManager {
  // Build a "fingerprint" string from all three API keys.
  // If the keys change, the fingerprint changes, and we recreate the manager.
  // ?? "" → use empty string if the key is undefined (so join() always works)
  const keyFingerprint = [
    input.openRouterApiKey  ?? "",
    input.openRouterApiKey2 ?? "",
    input.geminiApiKey      ?? "",
  ].join("|"); // "|" is the separator, e.g. "key1|key2|"

  // Check if we need to create a new AIManager instance.
  if (!_manager || _managerKeys !== keyFingerprint) {
    _manager = new AIManager(
      {
        // Register each provider only if its API key exists.
        // Undefined providers are silently skipped by AIManager.
        openrouter: input.openRouterApiKey
          ? { id: "openrouter", apiKey: input.openRouterApiKey }
          : undefined,  // ternary: condition ? valueIfTrue : valueIfFalse
        openrouter2: input.openRouterApiKey2
          ? { id: "openrouter2", apiKey: input.openRouterApiKey2 }
          : undefined,
        gemini: input.geminiApiKey?.startsWith("AIza")
          // Gemini keys always start with "AIza" — this rejects placeholder values
          ? { id: "gemini", apiKey: input.geminiApiKey }
          : undefined,
      },
      input.envVars ?? {}, // Pass env vars so AIManager can read MODELS_* overrides
    );
    _managerKeys = keyFingerprint;
  }
  return _manager;
}

// ── Fallback result ───────────────────────────────────────────────────────────

/**
 * Returns a safe VerifyResult when the AI pipeline fails completely.
 * Still shows all retrieved sources so the user can research manually.
 *
 * @param claim      The original claim text
 * @param explanation User-facing explanation of why AI failed
 * @param allSources All Tavily sources retrieved (for UI display)
 */
function fallbackResult(
  claim: string,
  explanation: string,
  allSources: Source[],
): AnalysisResult {
  return {
    claim,
    verdict:               "unverified", // Can't verify without AI
    confidence:            0,            // Zero confidence — we have no AI verdict
    explanation,
    truthStatement:
      "Walang kumpletong AI verdict na nakuha. Makikita mo pa rin ang mga web source sa ibaba.",
    supportingEvidence:    [],           // Empty — no AI classification
    contradictingEvidence: [],
    reliableSources:       allSources,   // Still show all sources! (better than nothing)
    mascotAdvice:
      "Ka-Teka! Basahin ang mga source sa ibaba habang hinihintay ang AI verdict.",
    searchResultsCount:    allSources.length,
    verifiedAt:            new Date().toISOString(), // ISO 8601 timestamp of now
    _persist:              false,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Max sources sent to the verdict AI call — keeps prompt small, saves quota */
const MAX_SOURCES_FOR_VERDICT = 5;

/**
 * Main analysis function: takes Tavily search results and returns a VerifyResult.
 *
 * @param input  AnalyseInput with claim, searchResults, and API keys
 * @returns      Promise<VerifyResult> — always resolves (never rejects)
 */
export async function analyseEvidence(input: AnalyseInput): Promise<AnalysisResult> {
  // Get (or create) the shared AIManager singleton.
  const manager = getManager(input);

  // Build a Map of url → ScoredSource for all Tavily results.
  // A ScoredSource adds credibilityScore and credibilityCategory to each Source.
  const scoredIndex = buildScoredSourceIndex(input.searchResults);

  // Convert the Map to an array of Source objects for the UI (all sources, no filter).
  // Array.from(map.values()) converts Map values to a plain array.
  // The destructuring `{ credibilityScore: _cs, credibilityCategory: _cc, ...s }`
  // strips the scoring fields (they're internal) and keeps the rest as `s`.
  const allSources: Source[] = Array.from(scoredIndex.values()).map(
    ({ credibilityScore: _cs, credibilityCategory: _cc, ...s }) => s,
  );

  // ── Select top sources by credibility for the AI call ────────────────────
  // Sort all Tavily results descending by credibility score.
  // We spread [...input.searchResults] to avoid mutating the original array.
  const rankedSources = [...input.searchResults].sort((a, b) => {
    // Look up the credibility score for each URL.
    // ?? 40 = default score of 40 if the URL isn't in our scored index.
    const sa = scoredIndex.get(a.url)?.credibilityScore ?? 40;
    const sb = scoredIndex.get(b.url)?.credibilityScore ?? 40;
    return sb - sa; // Descending: higher score sorts first
  }).slice(0, MAX_SOURCES_FOR_VERDICT); // Take only the top 5

  // Build the source block to include in the AI prompt.
  // Each source becomes one line: [1] "Title" | SourceName (score:90) | date:2026-07-01 | "excerpt"
  const topSourcesBlock = rankedSources.map((r, i) => {
    const s       = scoredIndex.get(r.url)!; // ! = non-null assertion (we know it exists)
    const excerpt = s.summary.slice(0, 150).replace(/\n/g, " "); // First 150 chars, no newlines
    const date    = s.publishedDate ? ` | date:${s.publishedDate}` : ""; // Only include if available
    return `[${i + 1}] "${s.title}" | ${s.sourceName} (score:${s.credibilityScore})${date} | "${excerpt}"`;
  }).join("\n"); // Join all lines with newlines for the prompt

  // ── Build the AI messages ─────────────────────────────────────────────────
  // Most AI models use a "chat" format: system message (rules) + user message (question).

  // The system message defines the AI's persona and strict rules.
  const systemMsg: AIMessage = {
    role: "system", // "system" = high-priority instructions that shape the AI's behaviour
    content:
      `You are Teka Muna, a Filipino AI fact-checker.\n` +
      `RULES:\n` +
      `1. Base verdict ONLY on the provided sources. Do NOT invent facts.\n` +
      `2. credibilityScore affects confidence weight, NOT the verdict.\n` +
      `3. Verdict: "true"=evidence supports, "false"=evidence contradicts, ` +
      `"misleading"=partially true/out of context, "unverified"=insufficient evidence.\n` +
      `4. Write in clear, natural Filipino using short sentences an ordinary reader can understand.\n` +
      `5. Silently correct grammar in the claim without changing its meaning. Do not copy its errors.\n` +
      `6. Do not claim a relationship or event unless a provided source explicitly supports it.\n` +
      `7. Output ONLY a single JSON object. No markdown, no extra text.\n` +
      `8. Return at most 3 items per evidence array; each summary must be at most 25 words.\n\n` +
      // We include the exact JSON shape so the AI knows what fields to include.
      `JSON shape (exact, no extra fields):\n` +
      `{"verdict":"true|false|misleading|unverified","confidence":0-100,` +
      `"explanation":"2-3 sentences Filipino/Taglish","truthStatement":"1-2 sentences",` +
      `"supportingEvidence":[{"title":"","url":"","sourceName":"","publishedDate":"","summary":""}],` +
      `"contradictingEvidence":[{"title":"","url":"","sourceName":"","publishedDate":"","summary":""}],` +
      `"mascotAdvice":"1 Taglish sentence","searchResultsCount":${input.searchResults.length}}`,
  };

  // The user message contains the actual claim and the source data.
  const userMsg: AIMessage = {
    role: "user", // "user" = the query/prompt to respond to
    content:
      `CLAIM: "${input.claim}"` +
      (input.category ? ` [${input.category}]` : "") + // Only add category if provided
      `\n\nTOP ${rankedSources.length} SOURCES (by credibility):\n${topSourcesBlock}\n\n` +
      `Use EXACT urls/titles from sources above. Return ONE JSON object only.`,
  };

  // ── Single verdict AI call ───────────────────────────────────────────────
  // We use a single AI call (not multi-phase) to conserve free-tier quota.

  // Partial<VerifyResult> means "an object with SOME of VerifyResult's fields".
  // The AI might not return every field perfectly, so Partial is safer than VerifyResult.
  let verdictData: Partial<VerifyResult>;
  let aiModelUsed = "unknown"; // Tracks which model/provider answered

  try {
    // manager.complete() tries each AI provider in order until one succeeds.
    // task: "VERDICT" → tells AIManager which model list to use for this task.
    // Map routing mode to internal AIManager provider identifier
    let forcedProvider: string | undefined;
    if (input.aiProviderMode === "force_openrouter_key1") forcedProvider = "openrouter";
    else if (input.aiProviderMode === "force_openrouter_key2") forcedProvider = "openrouter2";
    else if (input.aiProviderMode === "force_gemini") forcedProvider = "gemini";

    const response = await manager.complete({
      task:        "VERDICT",
      messages:    [systemMsg, userMsg],
      maxTokens:   1800,
      jsonMode:    true,
      validateContent: (content) => {
        parseVerdictContent(content, new Set(rankedSources.map((source) => source.url)));
      },
      temperature: 0.1,       // Low temperature (0–1) = more deterministic, less creative
      requestId:   `verify_${Date.now()}`, // Unique ID for logging
      forcedProvider,
    });

    // response.content is the raw text from the AI.
    // Parse and validate again so verdictData is available for result assembly.
    try {
      verdictData = parseVerdictContent(
        response.content,
        new Set(rankedSources.map((source) => source.url)),
      );
    } catch {
      // If the AI returned malformed JSON, log it and return the fallback.
      console.error(`[analyseEvidence] JSON parse failed. Raw: ${response.content.slice(0, 300)}`);
      return fallbackResult(
        input.claim,
        "Hindi kumpleto o hindi mabasa ang sagot ng AI. Pakisubukan muli mamaya.",
        allSources,
      );
    }

    aiModelUsed = `${response.providerUsed}/${response.modelUsed}`;

  } catch (err) {
    // AIExhaustedError is thrown when every AI provider failed.
    if (err instanceof AIExhaustedError) {
      console.error(`[analyseEvidence] All models exhausted: ${err.message}`);
      const reasons = err.attempts.map((attempt) => attempt.reason.toLowerCase()).join(" ");
      const explanation =
        reasons.includes("quota") || reasons.includes("rate limit") || reasons.includes("429")
          ? "Hindi pa namin masuri ang claim dahil pansamantalang naubos ang libreng AI quota. Pakisubukan muli mamaya."
          : reasons.includes("truncated") || reasons.includes("parse") || reasons.includes("invalid")
            ? "Hindi kumpleto o hindi mabasa ang mga sagot ng AI. Pakisubukan muli mamaya."
            : "Hindi available ang mga AI provider sa ngayon. Pakisubukan muli mamaya.";
      return fallbackResult(
        input.claim,
        explanation,
        allSources,
      );
    }
    // Any other error (unexpected) is re-thrown — let the route handler deal with it.
    throw err;
  }

  // ── Assemble VerifyResult ────────────────────────────────────────────────
  // Now we take the raw AI output and build a clean, validated VerifyResult.

  const srcCount   = input.searchResults.length;

  // ?? "unverified" → default to "unverified" if the AI didn't include "verdict"
  // `as Verdict` tells TypeScript we trust this is one of the four valid values
  const rawVerdict = (verdictData.verdict ?? "unverified") as Verdict;

  // Clamp the confidence to a realistic range based on how many sources we had.
  const confidence = clampConfidence(
    Math.round(Number(verdictData.confidence ?? 40)), // Number() ensures it's a number
    srcCount,
  );

  // Safety: if there were 0 search results and AI says "true", override to "unverified".
  // The AI can't verify anything without sources, so "true" would be fabricated.
  const verdict: Verdict =
    srcCount === 0 && rawVerdict === "true" ? "unverified" : rawVerdict;

  // ── Source normaliser ────────────────────────────────────────────────────
  // Converts the AI's raw source arrays into clean Source objects.
  // We prefer data from our scoredIndex over the AI's data (more reliable).
  const toSrc = (arr: unknown): Source[] => {
    if (!Array.isArray(arr)) return []; // Guard: if AI didn't return an array, use []
    return arr.map((item) => {
      const raw   = item as Record<string, unknown>; // Treat each item as a generic object
      const url   = String(raw.url ?? "");           // String() ensures it's always a string
      const known = scoredIndex.get(url);            // Look up in our credibility index
      // Prefer AI-provided date, fall back to Tavily-scraped date.
      // String(...).trim() cleans whitespace. || known?.publishedDate falls back to Tavily's value.
      const publishedDate =
        String(raw.publishedDate ?? "").trim() ||
        known?.publishedDate ||
        "";
      return {
        // Prefer scoredIndex data (from Tavily/credibility scoring) over AI data.
        // ?? is used for each field: try the known (indexed) value first, fall back to AI's value.
        title:         known?.title         ?? String(raw.title         ?? ""),
        url:           known?.url           ?? url,
        sourceName:    known?.sourceName    ?? String(raw.sourceName    ?? ""),
        publishedDate,
        summary:       String(raw.summary   ?? known?.summary           ?? ""),
      };
    });
  };

  // Build and return the final VerifyResult.
  return {
    claim:                 input.claim,
    verdict,
    confidence,
    explanation:           String(verdictData.explanation    ?? ""), // String() = safe fallback
    truthStatement:        String(verdictData.truthStatement ?? ""),
    supportingEvidence:    toSrc(verdictData.supportingEvidence),
    contradictingEvidence: toSrc(verdictData.contradictingEvidence),
    reliableSources:       allSources,  // Always all sources — never just the AI's subset
    mascotAdvice: String(
      verdictData.mascotAdvice ??
      "Ka-Teka! Palaging mag-double check bago maniwala o mag-share.", // Default if AI omits it
    ),
    searchResultsCount:  srcCount,
    verifiedAt:          new Date().toISOString(), // ISO 8601 timestamp
    cached:              false,                    // Always false for fresh pipeline results
    cacheStatus:         null,
    category:            input.category,
    pipelineVersion:     undefined,               // Injected by the route handler after save
    expiresAt:           undefined,               // Injected by the route handler after save
    _persist:            true,
    _aiModelUsed:        aiModelUsed,             // Internal — stripped before sending to client
  } as AnalysisResult;
}
