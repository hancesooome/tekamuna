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
import { buildScoredSourceIndex }     from "./credibility";
import { AIManager, AIExhaustedError } from "../ai/AIManager";
import type { AIMessage }              from "../ai/types/index";
import { extractJson }                 from "../utils/json";

// ── Public input type ─────────────────────────────────────────────────────────

export interface AnalyseInput {
  claim: string;
  category?: string;
  searchResults: SearchResult[];
  geminiApiKey?: string | undefined;
  openRouterApiKey?:  string | undefined;
  openRouterApiKey2?: string | undefined;  // second key, used when first is exhausted
  envVars?: Record<string, string | undefined>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampConfidence(confidence: number, relevantSources: number): number {
  if (relevantSources === 0) return Math.min(confidence, 40);
  if (relevantSources === 1) return Math.min(confidence, 70);
  return Math.max(30, Math.min(confidence, 95));
}

// ── Singleton AIManager ───────────────────────────────────────────────────────
// IMPORTANT: must be module-level so health state persists across requests
// within the same Worker isolate. A new instance per request throws away all
// failure/cooldown tracking, defeating the entire fallback mechanism.

let _manager: AIManager | null = null;
let _managerKeys = "";   // tracks which keys were used to create the singleton

function getManager(input: AnalyseInput): AIManager {
  // Fingerprint the current keys — recreate if they changed
  const keyFingerprint = [
    input.openRouterApiKey  ?? "",
    input.openRouterApiKey2 ?? "",
    input.geminiApiKey      ?? "",
  ].join("|");

  if (!_manager || _managerKeys !== keyFingerprint) {
    _manager = new AIManager(
      {
        openrouter: input.openRouterApiKey
          ? { id: "openrouter", apiKey: input.openRouterApiKey }
          : undefined,
        openrouter2: input.openRouterApiKey2
          ? { id: "openrouter2", apiKey: input.openRouterApiKey2 }
          : undefined,
        gemini: input.geminiApiKey?.startsWith("AIza")
          ? { id: "gemini", apiKey: input.geminiApiKey }
          : undefined,
      },
      input.envVars ?? {},
    );
    _managerKeys = keyFingerprint;
    console.info(
      `[Pipeline] AIManager singleton created. ` +
      `Providers: OR1=${!!input.openRouterApiKey} OR2=${!!input.openRouterApiKey2} Gemini=${!!input.geminiApiKey?.startsWith("AIza")}`,
    );
  }
  return _manager;
}

// ── Fallback result ───────────────────────────────────────────────────────────

function fallbackResult(
  claim: string,
  reason: string,
  allSources: Source[],
): VerifyResult {
  return {
    claim,
    verdict:               "unverified",
    confidence:            0,
    explanation:
      "Hindi pa namin masuri ang claim na ito dahil naubos ang aming AI quota ngayon. " +
      "Makikita mo pa rin ang mga web sources na nahanap namin sa ibaba.",
    truthStatement:        reason,
    supportingEvidence:    [],
    contradictingEvidence: [],
    reliableSources:       allSources,
    mascotAdvice:
      "Ka-Teka! Basahin ang mga source sa ibaba habang hinihintay ang AI verdict.",
    searchResultsCount:    allSources.length,
    verifiedAt:            new Date().toISOString(),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Max sources sent to the verdict AI call — keeps prompt small, saves quota */
const MAX_SOURCES_FOR_VERDICT = 5;

export async function analyseEvidence(input: AnalyseInput): Promise<VerifyResult> {
  const manager = getManager(input);

  // Build scored source index for all Tavily results
  const scoredIndex = buildScoredSourceIndex(input.searchResults);

  // All sources for UI display — always returned regardless of AI outcome
  const allSources: Source[] = Array.from(scoredIndex.values()).map(
    ({ credibilityScore: _cs, credibilityCategory: _cc, ...s }) => s,
  );

  // ── Select top sources by credibility for the AI call ────────────────────
  // Sort descending by credibility, take top N. This keeps the prompt
  // small (1 AI call) while using the most authoritative sources.
  const rankedSources = [...input.searchResults].sort((a, b) => {
    const sa = scoredIndex.get(a.url)?.credibilityScore ?? 40;
    const sb = scoredIndex.get(b.url)?.credibilityScore ?? 40;
    return sb - sa;
  }).slice(0, MAX_SOURCES_FOR_VERDICT);

  // Build a synthetic MergedEvidenceGraph from the top sources
  // using backend-only logic (no per-article AI calls)
  const topSourcesBlock = rankedSources.map((r, i) => {
    const s       = scoredIndex.get(r.url)!;
    const excerpt = s.summary.slice(0, 150).replace(/\n/g, " ");
    const date    = s.publishedDate ? ` | date:${s.publishedDate}` : "";
    return `[${i + 1}] "${s.title}" | ${s.sourceName} (score:${s.credibilityScore})${date} | "${excerpt}"`;
  }).join("\n");

  const systemMsg: AIMessage = {
    role: "system",
    content:
      `You are Teka Muna, a Filipino AI fact-checker.\n` +
      `RULES:\n` +
      `1. Base verdict ONLY on the provided sources. Do NOT invent facts.\n` +
      `2. credibilityScore affects confidence weight, NOT the verdict.\n` +
      `3. Verdict: "true"=evidence supports, "false"=evidence contradicts, ` +
      `"misleading"=partially true/out of context, "unverified"=insufficient evidence.\n` +
      `4. Output ONLY a single JSON object. No markdown, no extra text.\n\n` +
      `JSON shape (exact, no extra fields):\n` +
      `{"verdict":"true|false|misleading|unverified","confidence":0-100,` +
      `"explanation":"2-3 sentences Filipino/Taglish","truthStatement":"1-2 sentences",` +
      `"supportingEvidence":[{"title":"","url":"","sourceName":"","publishedDate":"","summary":""}],` +
      `"contradictingEvidence":[{"title":"","url":"","sourceName":"","publishedDate":"","summary":""}],` +
      `"reliableSources":[{"title":"","url":"","sourceName":"","publishedDate":"","summary":""}],` +
      `"mascotAdvice":"1 Taglish sentence","searchResultsCount":${input.searchResults.length}}`,
  };

  const userMsg: AIMessage = {
    role: "user",
    content:
      `CLAIM: "${input.claim}"` +
      (input.category ? ` [${input.category}]` : "") +
      `\n\nTOP ${rankedSources.length} SOURCES (by credibility):\n${topSourcesBlock}\n\n` +
      `Use EXACT urls/titles from sources above. Return ONE JSON object only.`,
  };

  // ── Single verdict AI call ───────────────────────────────────────────────
  let verdictData: Partial<VerifyResult>;
  try {
    const response = await manager.complete({
      task:        "VERDICT",
      messages:    [systemMsg, userMsg],
      maxTokens:   1200,
      temperature: 0.1,
      requestId:   `verify_${Date.now()}`,
    });

    try {
      verdictData = extractJson<Partial<VerifyResult>>(response.content);
    } catch {
      console.error(`[analyseEvidence] JSON parse failed. Raw: ${response.content.slice(0, 300)}`);
      return fallbackResult(input.claim, `JSON parse error from ${response.modelUsed}.`, allSources);
    }

    console.info(
      `[analyseEvidence] Success via ${response.providerUsed}/${response.modelUsed} ` +
      `in ${response.latencyMs}ms`,
    );
  } catch (err) {
    if (err instanceof AIExhaustedError) {
      console.error(`[analyseEvidence] All models exhausted: ${err.message}`);
      return fallbackResult(
        input.claim,
        "Lahat ng AI providers ay hindi available ngayon. Subukan ulit mamaya.",
        allSources,
      );
    }
    throw err;
  }

  // ── Assemble VerifyResult ────────────────────────────────────────────────
  const srcCount   = input.searchResults.length;
  const rawVerdict = (verdictData.verdict ?? "unverified") as Verdict;
  const confidence = clampConfidence(
    Math.round(Number(verdictData.confidence ?? 40)),
    srcCount,
  );
  const verdict: Verdict =
    srcCount === 0 && rawVerdict === "true" ? "unverified" : rawVerdict;

  const toSrc = (arr: unknown): Source[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => {
      const raw   = item as Record<string, unknown>;
      const url   = String(raw.url ?? "");
      const known = scoredIndex.get(url);
      // Prefer AI-provided date, fall back to Tavily-scraped date
      const publishedDate =
        String(raw.publishedDate ?? "").trim() ||
        known?.publishedDate ||
        "";
      return {
        title:         known?.title         ?? String(raw.title         ?? ""),
        url:           known?.url           ?? url,
        sourceName:    known?.sourceName    ?? String(raw.sourceName    ?? ""),
        publishedDate,
        summary:       String(raw.summary   ?? known?.summary           ?? ""),
      };
    });
  };

  return {
    claim:                 input.claim,
    verdict,
    confidence,
    explanation:           String(verdictData.explanation    ?? ""),
    truthStatement:        String(verdictData.truthStatement ?? ""),
    supportingEvidence:    toSrc(verdictData.supportingEvidence),
    contradictingEvidence: toSrc(verdictData.contradictingEvidence),
    reliableSources:       allSources,  // always all sources for UI
    mascotAdvice: String(
      verdictData.mascotAdvice ??
      "Ka-Teka! Palaging mag-double check bago maniwala o mag-share.",
    ),
    searchResultsCount: srcCount,
    verifiedAt:         new Date().toISOString(),
  };
}
