/**
 * worker/lib/adminSettings.ts
 *
 * Fetches admin routing configuration from the Supabase `admin_settings` table.
 *
 * Uses a direct HTTP fetch to the Supabase PostgREST API (no SDK import needed).
 * This keeps the Worker bundle tiny and avoids Node.js compatibility issues.
 *
 * Settings are cached in-memory for 60 seconds per Worker isolate so every
 * fact-check request doesn't incur a Supabase round-trip.
 *
 * Valid values:
 *   tavily_mode:      'auto' | 'force_key1' | 'force_key2'
 *   ai_provider_mode: 'auto' | 'force_openrouter_key1' | 'force_openrouter_key2' | 'force_gemini'
 */

import type { Env } from "../index";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TavilyMode =
  | "auto"
  | "force_key1"
  | "force_key2";

export type AiProviderMode =
  | "auto"
  | "force_openrouter_key1"
  | "force_openrouter_key2"
  | "force_gemini";

export interface AdminSettings {
  tavilyMode:      TavilyMode;
  aiProviderMode:  AiProviderMode;
}

// ── Defaults (used when Supabase is unreachable or not configured) ────────────

const DEFAULTS: AdminSettings = {
  tavilyMode:     "auto",
  aiProviderMode: "auto",
};

// ── In-memory cache ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 seconds

let cachedSettings: AdminSettings | null = null;
let cacheExpiresAt = 0;

// ── Supabase row type ─────────────────────────────────────────────────────────

interface SettingRow {
  setting_key:   string;
  setting_value: string;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Returns the current admin routing settings.
 * Falls back to DEFAULTS if Supabase is not configured or unreachable.
 * Results are cached for 60 seconds.
 */
export async function fetchAdminSettings(env: Env): Promise<AdminSettings> {
  // Return cached settings if still valid
  if (cachedSettings && Date.now() < cacheExpiresAt) {
    return cachedSettings;
  }

  // Supabase not configured — silently use defaults
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return DEFAULTS;
  }

  try {
    const url = `${env.SUPABASE_URL}/rest/v1/admin_settings?select=setting_key,setting_value`;

    const res = await fetch(url, {
      headers: {
        "apikey":        env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type":  "application/json",
      },
    });

    if (!res.ok) {
      console.error(`[AdminSettings] Supabase returned HTTP ${res.status} — using defaults.`);
      return DEFAULTS;
    }

    const rows = (await res.json()) as SettingRow[];

    // Build settings object from rows
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.setting_key] = row.setting_value;
    }

    const settings: AdminSettings = {
      tavilyMode:     toTavilyMode(map["tavily_mode"]),
      aiProviderMode: toAiProviderMode(map["ai_provider_mode"]),
    };

    // Cache the result
    cachedSettings  = settings;
    cacheExpiresAt  = Date.now() + CACHE_TTL_MS;

    return settings;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[AdminSettings] Fetch failed: ${msg} — using defaults.`);
    return DEFAULTS;
  }
}

/**
 * Invalidates the in-memory cache so the next call fetches fresh settings.
 * Call this after saving settings from the dashboard API route.
 */
export function invalidateAdminSettingsCache(): void {
  cachedSettings = null;
  cacheExpiresAt = 0;
}

// ── Validators ────────────────────────────────────────────────────────────────

function toTavilyMode(value: string | undefined): TavilyMode {
  const valid: TavilyMode[] = ["auto", "force_key1", "force_key2"];
  return valid.includes(value as TavilyMode) ? (value as TavilyMode) : "auto";
}

function toAiProviderMode(value: string | undefined): AiProviderMode {
  const valid: AiProviderMode[] = [
    "auto",
    "force_openrouter_key1",
    "force_openrouter_key2",
    "force_gemini",
  ];
  return valid.includes(value as AiProviderMode) ? (value as AiProviderMode) : "auto";
}
