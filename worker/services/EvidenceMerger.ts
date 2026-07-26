/**
 * EvidenceMerger
 *
 * Pure backend logic — NO AI calls.
 *
 * Takes an array of FactRecord (one per article) and produces a
 * MergedEvidenceGraph that the final verdict AI call consumes.
 *
 * Steps performed entirely in code:
 *   1. Filter irrelevant sources
 *   2. Cluster similar facts (simple keyword overlap)
 *   3. Detect contradictions between clusters
 *   4. Compute weighted corroboration scores using credibility
 *   5. Build compact evidence graph for the verdict prompt
 */

import type { FactRecord, ExtractedFact } from "./EvidenceExtractor";

// ── Output types ──────────────────────────────────────────────────────────────

export interface EvidenceCluster {
  /** Representative fact statement (from highest-credibility source). */
  statement:          string;
  /** How many independent sources corroborate this fact. */
  corroborationCount: number;
  /** Weighted credibility score (avg of source credibility scores). */
  weightedCredibility: number;
  /** Sources that contribute to this cluster. */
  sources: Array<{
    url:             string;
    sourceName:      string;
    credibilityScore: number;
    publishedDate:   string;
    quote?:          string;
  }>;
  /** Which direction this cluster points. */
  direction: "supports" | "contradicts" | "neutral";
}

export interface ContradictionPair {
  clusterA: EvidenceCluster;
  clusterB: EvidenceCluster;
  reason:   string;
}

export interface MergedEvidenceGraph {
  claim: string;

  /** Clusters that support the claim. */
  supportingClusters:     EvidenceCluster[];
  /** Clusters that contradict the claim. */
  contradictingClusters:  EvidenceCluster[];
  /** Neutral / background clusters. */
  neutralClusters:        EvidenceCluster[];

  /** Detected contradictions between supporting and contradicting clusters. */
  contradictions: ContradictionPair[];

  /** All sources (including irrelevant) for display in the UI. */
  allSources: Array<{
    url:             string;
    title:           string;
    sourceName:      string;
    publishedDate:   string;
    credibilityScore: number;
    credibilityCategory: string;
    summary:         string;
  }>;

  /** Summary stats. */
  stats: {
    totalSources:       number;
    relevantSources:    number;
    supportingFacts:    number;
    contradictingFacts: number;
    avgCredibility:     number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a fact string for similarity comparison.
 * Lowercase, remove punctuation, split into tokens.
 */
function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3), // skip stopwords by length
  );
}

/**
 * Jaccard similarity between two token sets.
 */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) if (b.has(tok)) intersection++;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

/** Threshold above which two facts are considered the same claim. */
const CLUSTER_THRESHOLD = 0.25;

// ── Core clustering ───────────────────────────────────────────────────────────

interface SeedFact {
  fact:             ExtractedFact;
  url:              string;
  sourceName:       string;
  credibilityScore: number;
  publishedDate:    string;
}

function clusterFacts(
  seeds: SeedFact[],
  direction: "supports" | "contradicts" | "neutral",
): EvidenceCluster[] {
  const clusters: Array<{
    tokens:  Set<string>;
    members: SeedFact[];
  }> = [];

  for (const seed of seeds) {
    const seedTokens = tokenise(seed.fact.fact);
    let matched = false;

    for (const cluster of clusters) {
      if (similarity(seedTokens, cluster.tokens) >= CLUSTER_THRESHOLD) {
        cluster.members.push(seed);
        // Expand cluster tokens with new member's tokens
        for (const tok of seedTokens) cluster.tokens.add(tok);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({ tokens: seedTokens, members: [seed] });
    }
  }

  return clusters.map((c) => {
    // Representative = highest credibility source
    const sorted = [...c.members].sort(
      (a, b) => b.credibilityScore - a.credibilityScore,
    );
    const representative = sorted[0];
    const avgCredibility = Math.round(
      c.members.reduce((sum, m) => sum + m.credibilityScore, 0) / c.members.length,
    );

    return {
      statement:           representative.fact.fact,
      corroborationCount:  c.members.length,
      weightedCredibility: avgCredibility,
      direction,
      sources: sorted.map((m) => ({
        url:              m.url,
        sourceName:       m.sourceName,
        credibilityScore: m.credibilityScore,
        publishedDate:    m.publishedDate,
        quote:            m.fact.quote,
      })),
    };
  });
}

// ── Contradiction detection ───────────────────────────────────────────────────

function detectContradictions(
  supporting:    EvidenceCluster[],
  contradicting: EvidenceCluster[],
): ContradictionPair[] {
  const pairs: ContradictionPair[] = [];

  for (const s of supporting) {
    for (const c of contradicting) {
      const simScore = similarity(tokenise(s.statement), tokenise(c.statement));
      // High token overlap between supporting and contradicting = direct contradiction
      if (simScore >= 0.2) {
        pairs.push({
          clusterA: s,
          clusterB: c,
          reason:
            `"${s.statement.slice(0, 80)}" vs "${c.statement.slice(0, 80)}" ` +
            `(${Math.round(simScore * 100)}% overlap)`,
        });
      }
    }
  }

  return pairs;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function mergeEvidence(
  claim: string,
  records: FactRecord[],
): MergedEvidenceGraph {
  // All sources go into allSources for UI display
  const allSources = records.map((r) => ({
    url:                 r.url,
    title:               r.title,
    sourceName:          r.sourceName,
    publishedDate:       r.publishedDate,
    credibilityScore:    r.credibilityScore,
    credibilityCategory: r.credibilityCategory,
    summary:             r.summary,
  }));

  // Only process relevant records with actual facts
  const relevant = records.filter((r) => r.relevant && r.facts.length > 0);

  // Separate facts by direction
  const supportingSeeds:    SeedFact[] = [];
  const contradictingSeeds: SeedFact[] = [];
  const neutralSeeds:       SeedFact[] = [];

  for (const record of relevant) {
    for (const fact of record.facts) {
      const seed: SeedFact = {
        fact,
        url:              record.url,
        sourceName:       record.sourceName,
        credibilityScore: record.credibilityScore,
        publishedDate:    record.publishedDate,
      };

      if (fact.relevance === "supports")     supportingSeeds.push(seed);
      else if (fact.relevance === "contradicts") contradictingSeeds.push(seed);
      else                                       neutralSeeds.push(seed);
    }
  }

  const supportingClusters    = clusterFacts(supportingSeeds,    "supports");
  const contradictingClusters = clusterFacts(contradictingSeeds, "contradicts");
  const neutralClusters       = clusterFacts(neutralSeeds,       "neutral");

  // Sort clusters by corroboration × credibility
  const rank = (c: EvidenceCluster) =>
    c.corroborationCount * c.weightedCredibility;

  supportingClusters.sort((a, b) => rank(b) - rank(a));
  contradictingClusters.sort((a, b) => rank(b) - rank(a));

  const contradictions = detectContradictions(
    supportingClusters,
    contradictingClusters,
  );

  // Stats
  const relevantCreds = relevant.map((r) => r.credibilityScore);
  const avgCredibility = relevantCreds.length > 0
    ? Math.round(relevantCreds.reduce((s, v) => s + v, 0) / relevantCreds.length)
    : 0;

  return {
    claim,
    supportingClusters,
    contradictingClusters,
    neutralClusters,
    contradictions,
    allSources,
    stats: {
      totalSources:       records.length,
      relevantSources:    relevant.length,
      supportingFacts:    supportingSeeds.length,
      contradictingFacts: contradictingSeeds.length,
      avgCredibility,
    },
  };
}
