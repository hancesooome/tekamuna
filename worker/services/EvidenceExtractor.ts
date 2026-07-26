/**
 * EvidenceExtractor
 *
 * Processes ONE article at a time and extracts structured facts from it.
 *
 * Why per-article?
 *   - Each AI call is tiny (~300-500 tokens input, ~200 tokens output)
 *   - No single request ever blows a token limit regardless of article count
 *   - Failed extractions are skipped without losing other articles
 *   - Scales from 5 sources to 100+ with zero config changes
 *
 * The extracted FactRecord is pure data — no verdict, no confidence.
 * The backend (EvidenceMerger) does all the reasoning, not AI.
 */

import type { AIManager } from "../ai/AIManager";
import type { SearchResult } from "../../src/types/verify";
import { estimateTokens } from "./PromptBuilder";

// ── Output types ──────────────────────────────────────────────────────────────

export type FactRelevance = "supports" | "contradicts" | "neutral" | "unrelated";

export interface ExtractedFact {
  /** Verbatim or near-verbatim fact from the source. */
  fact: string;
  /** Whether this fact supports, contradicts, or is neutral to the claim. */
  relevance: FactRelevance;
  /** Direct quote from the source if available. */
  quote?: string;
}

export interface FactRecord {
  /** Source metadata. */
  url:                 string;
  title:               string;
  sourceName:          string;
  publishedDate:       string;
  credibilityScore:    number;
  credibilityCategory: string;

  /** Whether the source is relevant to the claim at all. */
  relevant: boolean;

  /** Structured facts extracted from this source. Empty if not relevant. */
  facts: ExtractedFact[];

  /** One-line summary of what this source says about the claim. */
  summary: string;

  /** If extraction failed, the error message. */
  extractionError?: string;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const MAX_EXCERPT_CHARS = 600;
/** Token budget for a single extraction call. */
const EXTRACTION_MAX_TOKENS = 400;

function buildExtractionPrompt(
  claim: string,
  article: SearchResult,
): { system: string; user: string } {
  const excerpt = (article.content ?? "").slice(0, MAX_EXCERPT_CHARS).replace(/\n+/g, " ");

  const system =
    `You extract facts from a news article relevant to a claim. ` +
    `Output ONLY a JSON object. No markdown. No explanation.`;

  const user =
    `CLAIM: "${claim}"\n\n` +
    `ARTICLE: "${article.title}" (${article.url})\n` +
    `EXCERPT: "${excerpt}"\n\n` +
    `Extract facts. Output this exact JSON:\n` +
    `{"relevant":true|false,"summary":"1 sentence what this source says about claim","facts":[{"fact":"verifiable statement","relevance":"supports|contradicts|neutral","quote":"optional direct quote"}]}` +
    `\nIf not relevant: {"relevant":false,"summary":"not relevant","facts":[]}`;

  return { system, user };
}

// ── Extractor ─────────────────────────────────────────────────────────────────

interface RawExtraction {
  relevant?: boolean;
  summary?:  string;
  facts?:    Array<{
    fact?:      string;
    relevance?: string;
    quote?:     string;
  }>;
}

function parseExtraction(raw: string): RawExtraction {
  // Strip markdown fences and extract outermost JSON object
  let s = raw.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  const start = s.indexOf("{");
  if (start !== -1) s = s.slice(start);

  // Brace-depth tracking
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)       { esc = false; continue; }
    if (c === "\\") { esc = true;  continue; }
    if (c === '"')  { inStr = !inStr; continue; }
    if (inStr)      continue;
    if (c === "{")  { depth++; continue; }
    if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }

  const jsonStr = end !== -1 ? s.slice(0, end + 1) : s;
  return JSON.parse(jsonStr) as RawExtraction;
}

/**
 * Processes a single article and returns a FactRecord.
 * Never throws — extraction failures are captured in extractionError.
 */
export async function extractFactsFromArticle(
  claim: string,
  article: SearchResult,
  credibilityScore: number,
  credibilityCategory: string,
  manager: AIManager,
): Promise<FactRecord> {
  const base: Omit<FactRecord, "relevant" | "facts" | "summary" | "extractionError"> = {
    url:                 article.url,
    title:               article.title,
    sourceName:          new URL(article.url).hostname.replace(/^www\./, ""),
    publishedDate:       article.publishedDate ?? "",
    credibilityScore,
    credibilityCategory,
  };

  const { system, user } = buildExtractionPrompt(claim, article);

  // Estimate tokens before sending
  const estimatedInputTokens = estimateTokens(system + user);
  if (estimatedInputTokens > 1500) {
    // Truncate excerpt further and rebuild
    const shorter = (article.content ?? "").slice(0, 300).replace(/\n+/g, " ");
    const shortUser = user.replace(
      /EXCERPT: ".*?"\n/s,
      `EXCERPT: "${shorter}"\n`,
    );
    // Use shortened version silently
    return runExtraction(base, system, shortUser, manager);
  }

  return runExtraction(base, system, user, manager);
}

async function runExtraction(
  base: Omit<FactRecord, "relevant" | "facts" | "summary" | "extractionError">,
  system: string,
  user: string,
  manager: AIManager,
): Promise<FactRecord> {
  try {
    const response = await manager.complete({
      task:        "EVIDENCE_EXTRACTION",
      messages:    [
        { role: "system", content: system },
        { role: "user",   content: user   },
      ],
      maxTokens:   EXTRACTION_MAX_TOKENS,
      temperature: 0,
      requestId:   `extract_${base.url.slice(-20)}`,
    });

    const raw = parseExtraction(response.content);

    const facts: ExtractedFact[] = (raw.facts ?? []).map((f) => ({
      fact:      String(f.fact      ?? "").trim(),
      relevance: (["supports", "contradicts", "neutral", "unrelated"].includes(f.relevance ?? "")
        ? f.relevance as FactRelevance
        : "neutral"),
      quote: f.quote ? String(f.quote).trim() : undefined,
    })).filter((f) => f.fact.length > 0);

    return {
      ...base,
      relevant: raw.relevant !== false,
      summary:  String(raw.summary ?? "").slice(0, 200),
      facts,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      relevant:        false,
      facts:           [],
      summary:         "",
      extractionError: msg.slice(0, 150),
    };
  }
}

/**
 * Processes all articles in parallel (up to concurrency limit).
 * Returns FactRecord[] in the same order as input.
 */
export async function extractAllFacts(
  claim: string,
  articles: SearchResult[],
  scoreMap: Map<string, { credibilityScore: number; credibilityCategory: string }>,
  manager: AIManager,
  concurrency = 4,
): Promise<FactRecord[]> {
  const results: FactRecord[] = new Array(articles.length);

  // Process in batches to respect rate limits
  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((article) => {
        const scores = scoreMap.get(article.url) ?? {
          credibilityScore: 40, credibilityCategory: "Web",
        };
        return extractFactsFromArticle(
          claim, article,
          scores.credibilityScore, scores.credibilityCategory,
          manager,
        );
      }),
    );

    settled.forEach((result, j) => {
      results[i + j] = result.status === "fulfilled"
        ? result.value
        : {
            url:                 batch[j].url,
            title:               batch[j].title,
            sourceName:          new URL(batch[j].url).hostname.replace(/^www\./, ""),
            publishedDate:       batch[j].publishedDate ?? "",
            credibilityScore:    40,
            credibilityCategory: "Web",
            relevant:            false,
            facts:               [],
            summary:             "",
            extractionError:     result.reason instanceof Error
              ? result.reason.message.slice(0, 150)
              : String(result.reason),
          };
    });
  }

  return results;
}
