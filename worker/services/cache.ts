/**
 * worker/services/cache.ts
 *
 * Reusable Database Cache Service for the Fact-Checking Pipeline.
 * Interacts with Supabase using direct REST queries.
 */

import type { Env } from "../index";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CacheRow {
  id:                 string;
  claim_original:     string;
  claim_normalized:   string;
  category:           string;
  verdict:            string;
  confidence:         number;
  summary:            string;
  reasoning:          string;
  sources:            any; // JSON object containing supportingEvidence, contradictingEvidence, reliableSources, mascotAdvice
  search_provider:    string;
  ai_model:           string;
  pipeline_version:   number;
  created_at:         string;
  updated_at:         string;
  expires_at:         string;
}

export interface SaveCacheInput {
  claimOriginal:     string;
  claimNormalized:   string;
  category:           string;
  verdict:            string;
  confidence:         number;
  summary:            string; // maps to explanation
  reasoning:          string; // maps to truthStatement
  sources:            any;    // holds source groups & mascotAdvice
  searchProvider:     string;
  aiModel:            string;
  pipelineVersion:    number;
}

// ── Normalize Claim ───────────────────────────────────────────────────────────

/**
 * Normalizes a claim by converting to lowercase, removing punctuation and emojis,
 * collapsing multiple spaces, and trimming surrounding whitespace.
 */
export function normalizeClaim(claim: string): string {
  return claim
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove all non-letter, non-number, non-space characters
    .replace(/\s+/g, " ")             // Collapse multiple spaces
    .trim();
}

// ── Expiration Calculations ───────────────────────────────────────────────────

/**
 * Calculates cache expiration timestamp based on the classified category.
 */
export function calculateExpiration(category: string, now: Date = new Date()): Date {
  const durations: Record<string, number> = {
    breaking_news: 3 * 60 * 60 * 1000,         // 3 hours
    trending:      24 * 60 * 60 * 1000,        // 24 hours
    politics:      3 * 24 * 60 * 60 * 1000,    // 3 days
    statistics:    30 * 24 * 60 * 60 * 1000,   // 30 days
    health:        30 * 24 * 60 * 60 * 1000,   // 30 days
    historical:    365 * 24 * 60 * 60 * 1000,  // 365 days
    evergreen:     365 * 24 * 60 * 60 * 1000,  // 365 days
  };

  const ms = durations[category.toLowerCase()] || 3 * 24 * 60 * 60 * 1000; // Default: 3 days
  return new Date(now.getTime() + ms);
}

// ── Cache Client ──────────────────────────────────────────────────────────────

/**
 * Retrieves a cached claim from Supabase by its normalized value.
 */
export async function getCachedClaim(env: Env, normalizedClaim: string): Promise<CacheRow | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const encodedClaim = encodeURIComponent(normalizedClaim);
    const url = `${env.SUPABASE_URL}/rest/v1/fact_check_cache?claim_normalized=eq.${encodedClaim}&select=*`;

    const res = await fetch(url, {
      headers: {
        "apikey":        env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type":  "application/json",
      },
    });

    if (!res.ok) {
      console.error(`[Cache] Supabase returned HTTP ${res.status} on read.`);
      return null;
    }

    const rows = (await res.json()) as CacheRow[];
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error("[Cache] Failed to fetch cached claim:", err);
    return null;
  }
}

/**
 * Saves or updates a cached claim in Supabase.
 * Uses PostgREST upsert header resolution=merge-duplicates.
 */
export async function saveCachedClaim(env: Env, input: SaveCacheInput): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return;
  }

  try {
    const expiresAt = calculateExpiration(input.category).toISOString();
    const url = `${env.SUPABASE_URL}/rest/v1/fact_check_cache`;

    const body = {
      claim_original:   input.claimOriginal,
      claim_normalized: input.claimNormalized,
      category:         input.category,
      verdict:          input.verdict,
      confidence:       input.confidence,
      summary:          input.summary,
      reasoning:        input.reasoning,
      sources:          input.sources,
      search_provider:  input.searchProvider,
      ai_model:         input.aiModel,
      pipeline_version: input.pipelineVersion,
      expires_at:       expiresAt,
    };

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "apikey":        env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates", // UPSERT based on claim_normalized UNIQUE constraint
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Cache] Supabase returned HTTP ${res.status} on save: ${errText}`);
    }
  } catch (err) {
    console.error("[Cache] Failed to save claim to cache:", err);
  }
}
