/**
 * PromptBuilder
 *
 * Builds the final verdict prompt from a MergedEvidenceGraph.
 * Estimates token count before sending and splits/summarises if needed.
 *
 * Token estimation uses the ~4 chars/token heuristic which is accurate
 * enough for budget decisions without requiring a tokenizer.
 *
 * The final AI call only receives:
 *   - the user claim
 *   - top supporting clusters (compact)
 *   - top contradicting clusters (compact)
 *   - detected contradictions
 *   - corroboration stats
 *
 * Individual article excerpts are NEVER sent to the verdict model.
 * maxTokens is a safety cap, not the primary size-control mechanism.
 */

import type { MergedEvidenceGraph, EvidenceCluster } from "./EvidenceMerger";
import type { AIMessage } from "../ai/types/index";

// ── Token estimation ──────────────────────────────────────────────────────────

/** Approximate tokens from character count (~4 chars per token for English/Taglish). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Maximum input tokens we target for the verdict prompt.
 * This is the budget ceiling — we build to fit within it,
 * not rely on maxTokens truncation to handle overflow.
 */
const VERDICT_PROMPT_TOKEN_BUDGET = 1800;

/** Maximum clusters to include per direction. */
const MAX_CLUSTERS_PER_DIRECTION = 4;

/** Maximum sources to list per cluster. */
const MAX_SOURCES_PER_CLUSTER = 2;

// ── Cluster serialiser ────────────────────────────────────────────────────────

function serialiseCluster(c: EvidenceCluster, index: number): string {
  const sources = c.sources
    .slice(0, MAX_SOURCES_PER_CLUSTER)
    .map((s) => `${s.sourceName}(score:${s.credibilityScore})`)
    .join(", ");

  return (
    `  ${index + 1}. "${c.statement.slice(0, 120)}" ` +
    `[corroborated by ${c.corroborationCount} source(s): ${sources}]`
  );
}

// ── Builder ───────────────────────────────────────────────────────────────────

export interface BuiltPrompt {
  messages:     AIMessage[];
  estimatedInputTokens: number;
  claimsIncluded: {
    supporting:    number;
    contradicting: number;
    neutral:       number;
  };
}

export function buildVerdictPrompt(graph: MergedEvidenceGraph): BuiltPrompt {
  const systemContent =
    `You are Teka Muna, a Filipino AI fact-checker. ` +
    `You receive pre-processed structured evidence — NOT raw articles. ` +
    `Determine the verdict based ONLY on the evidence graph provided. ` +
    `Output ONLY a JSON object. No markdown. No explanation outside JSON.\n\n` +
    `JSON shape:\n` +
    `{"verdict":"true|false|misleading|unverified","confidence":0-100,` +
    `"explanation":"2-3 Filipino/Taglish sentences","truthStatement":"1-2 sentences",` +
    `"mascotAdvice":"1 Taglish sentence"}`;

  // Build supporting section — trim to budget
  let supportingIncluded  = 0;
  let contradictingIncluded = 0;
  let neutralIncluded     = 0;

  const supportingLines: string[] = [];
  for (const cluster of graph.supportingClusters.slice(0, MAX_CLUSTERS_PER_DIRECTION)) {
    const line = serialiseCluster(cluster, supportingLines.length);
    supportingLines.push(line);
    supportingIncluded++;
  }

  const contradictingLines: string[] = [];
  for (const cluster of graph.contradictingClusters.slice(0, MAX_CLUSTERS_PER_DIRECTION)) {
    const line = serialiseCluster(cluster, contradictingLines.length);
    contradictingLines.push(line);
    contradictingIncluded++;
  }

  const neutralLines: string[] = [];
  // Only add neutral if budget allows
  for (const cluster of graph.neutralClusters.slice(0, 2)) {
    neutralLines.push(serialiseCluster(cluster, neutralLines.length));
    neutralIncluded++;
  }

  const contradictionLines = graph.contradictions
    .slice(0, 3)
    .map((c, i) => `  ${i + 1}. ${c.reason}`);

  // Assemble user content
  let userContent =
    `CLAIM: "${graph.claim}"\n\n` +
    `EVIDENCE SUMMARY (pre-processed from ${graph.stats.totalSources} sources):\n` +
    `- Relevant sources: ${graph.stats.relevantSources}\n` +
    `- Avg credibility of relevant sources: ${graph.stats.avgCredibility}/100\n` +
    `- Supporting facts found: ${graph.stats.supportingFacts}\n` +
    `- Contradicting facts found: ${graph.stats.contradictingFacts}\n\n`;

  if (supportingLines.length > 0) {
    userContent += `SUPPORTING EVIDENCE CLUSTERS:\n${supportingLines.join("\n")}\n\n`;
  } else {
    userContent += `SUPPORTING EVIDENCE CLUSTERS: none found\n\n`;
  }

  if (contradictingLines.length > 0) {
    userContent += `CONTRADICTING EVIDENCE CLUSTERS:\n${contradictingLines.join("\n")}\n\n`;
  } else {
    userContent += `CONTRADICTING EVIDENCE CLUSTERS: none found\n\n`;
  }

  if (neutralLines.length > 0) {
    userContent += `NEUTRAL BACKGROUND:\n${neutralLines.join("\n")}\n\n`;
  }

  if (contradictionLines.length > 0) {
    userContent +=
      `DETECTED CONTRADICTIONS:\n${contradictionLines.join("\n")}\n\n`;
  }

  userContent +=
    `VERDICT RULES:\n` +
    `- "true": ≥2 corroborated supporting clusters, no strong contradictions\n` +
    `- "false": contradicting evidence outweighs supporting\n` +
    `- "misleading": some support but important context missing or exaggerated\n` +
    `- "unverified": insufficient or equally balanced evidence\n\n` +
    `Return ONE JSON object only.`;

  // Check if we're within budget; if not, trim neutral section
  const full = systemContent + userContent;
  let estimatedTokens = estimateTokens(full);

  if (estimatedTokens > VERDICT_PROMPT_TOKEN_BUDGET && neutralLines.length > 0) {
    // Drop neutral section to save space
    userContent = userContent.replace(/NEUTRAL BACKGROUND:[\s\S]*?\n\n/, "");
    neutralIncluded = 0;
    estimatedTokens = estimateTokens(systemContent + userContent);
  }

  if (estimatedTokens > VERDICT_PROMPT_TOKEN_BUDGET) {
    // Trim supporting/contradicting to top 2 each
    const supportingTrimmed = supportingLines.slice(0, 2).join("\n");
    const contradictingTrimmed = contradictingLines.slice(0, 2).join("\n");
    userContent = userContent
      .replace(
        /SUPPORTING EVIDENCE CLUSTERS:\n[\s\S]*?\n\n/,
        `SUPPORTING EVIDENCE CLUSTERS:\n${supportingTrimmed || "none"}\n\n`,
      )
      .replace(
        /CONTRADICTING EVIDENCE CLUSTERS:\n[\s\S]*?\n\n/,
        `CONTRADICTING EVIDENCE CLUSTERS:\n${contradictingTrimmed || "none"}\n\n`,
      );
    supportingIncluded  = Math.min(supportingIncluded, 2);
    contradictingIncluded = Math.min(contradictingIncluded, 2);
    estimatedTokens = estimateTokens(systemContent + userContent);
  }

  return {
    messages: [
      { role: "system", content: systemContent },
      { role: "user",   content: userContent   },
    ],
    estimatedInputTokens: estimatedTokens,
    claimsIncluded: {
      supporting:    supportingIncluded,
      contradicting: contradictingIncluded,
      neutral:       neutralIncluded,
    },
  };
}
