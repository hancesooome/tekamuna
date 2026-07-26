/**
 * AI Model Configuration
 *
 * This is the ONLY place where model names and priorities are defined.
 * Business logic never hardcodes model IDs.
 *
 * Priority order: first model in the list is tried first.
 * The list can be overridden per-task via environment variables.
 *
 * ── How to add a new model ────────────────────────────────────────────────────
 * 1. Add it to the DEFAULT_MODELS list below under the right task(s).
 * 2. Or override at runtime via the env var for that task (see TASK_ENV_VARS).
 *
 * ── How to change model priority ─────────────────────────────────────────────
 * Set the matching env var with a comma-separated list of model IDs.
 * Example:
 *   MODELS_VERDICT=deepseek/deepseek-chat:free,qwen/qwen3-32b:free
 *
 * ── How to add a new provider ─────────────────────────────────────────────────
 * 1. Add a provider id to PROVIDER_FOR_MODEL or use the prefix convention.
 * 2. Implement BaseProvider in /providers/<ProviderName>Provider.ts.
 * 3. Register it in AIManager.ts.
 */

import type { AITask, ModelDescriptor } from "../types/index";

// ── Provider resolution ───────────────────────────────────────────────────────

/**
 * Determines which provider handles a given model ID.
 * Convention: models starting with "gemini-" or matching Google's API format
 * go to GeminiProvider. Everything else routes to OpenRouter.
 *
 * To add a new provider, extend this function.
 */
export function resolveProvider(modelId: string): string {
  if (
    modelId.startsWith("gemini-") ||
    modelId.startsWith("models/gemini-")
  ) {
    return "gemini";
  }
  // Future: add "openai/gpt-" → "openai", "claude-" → "anthropic", etc.
  return "openrouter";
}

// ── Default model lists per task ──────────────────────────────────────────────
//
// Free models first (no cost), paid models as last-resort fallbacks.
// All :free models are rate-limited but cost nothing.
// Order = priority (index 0 = highest priority).

const DEFAULT_MODELS: Record<AITask, string[]> = {
  /**
   * VERDICT — most important task, needs best reasoning.
   * Prefer larger reasoning-capable models.
   */
  VERDICT: [
    "google/gemma-4-26b-a4b-it:free",       // Google Gemma 4 — free, 262k ctx
    "google/gemma-4-31b-it:free",            // Google Gemma 4 31B — free
    "deepseek/deepseek-chat:free",           // DeepSeek — strong reasoning, free
    "qwen/qwen3-32b:free",                   // Qwen 3 32B — free
    "nvidia/nemotron-3-super-120b-a12b:free",// Nvidia 120B — free
    "mistralai/mistral-small:free",          // Mistral Small — free fallback
    "gemini-2.0-flash",                      // Gemini direct — final fallback
    "gemini-1.5-flash",                      // Gemini 1.5 — last resort
  ],

  /**
   * EVIDENCE_EXTRACTION — structured JSON extraction from a single article.
   * Needs reliable instruction-following and JSON output.
   * Small/fast models preferred — this runs once per article.
   */
  EVIDENCE_EXTRACTION: [
    "google/gemma-4-26b-a4b-it:free",    // fast, good at structured output
    "mistralai/mistral-small:free",       // fast fallback
    "google/gemma-4-31b-it:free",
    "deepseek/deepseek-chat:free",
    "qwen/qwen3-32b:free",
  ],

  /**
   * SUMMARY — fast, low-cost summarisation.
   * Smaller/faster models preferred.
   */
  SUMMARY: [
    "google/gemma-4-26b-a4b-it:free",
    "mistralai/mistral-small:free",
    "qwen/qwen3-32b:free",
    "deepseek/deepseek-chat:free",
    "gemini-2.0-flash",
  ],

  SEARCH_QUERY: [
    "mistralai/mistral-small:free",
    "google/gemma-4-26b-a4b-it:free",
    "qwen/qwen3-32b:free",
    "gemini-2.0-flash",
  ],

  TRANSLATION: [
    "google/gemma-4-26b-a4b-it:free",
    "qwen/qwen3-32b:free",
    "deepseek/deepseek-chat:free",
    "mistralai/mistral-small:free",
    "gemini-2.0-flash",
  ],
};

// ── Environment variable names per task ───────────────────────────────────────
//
// Set these in .dev.vars or Cloudflare Worker secrets to override defaults.
// Format: comma-separated model IDs in priority order.
//
// Example .dev.vars entry:
//   MODELS_VERDICT=deepseek/deepseek-chat:free,qwen/qwen3-32b:free

const TASK_ENV_VARS: Record<AITask, string> = {
  VERDICT:             "MODELS_VERDICT",
  EVIDENCE_EXTRACTION: "MODELS_EVIDENCE_EXTRACTION",
  SUMMARY:             "MODELS_SUMMARY",
  SEARCH_QUERY:        "MODELS_SEARCH_QUERY",
  TRANSLATION:         "MODELS_TRANSLATION",
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the ordered list of ModelDescriptors for a given task.
 * Checks the environment variable first; falls back to the hardcoded default.
 *
 * @param task    The AI task being performed
 * @param envVars Key-value map of environment variables (pass `env` from Worker)
 */
export function getModelsForTask(
  task: AITask,
  envVars: Record<string, string | undefined> = {},
): ModelDescriptor[] {
  const envKey   = TASK_ENV_VARS[task];
  const envValue = envVars[envKey]?.trim();

  const modelIds: string[] = envValue
    ? envValue.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MODELS[task];

  return modelIds.map((modelId) => ({
    modelId,
    providerId: resolveProvider(modelId),
    free: modelId.endsWith(":free"),
    label: modelId,
  }));
}

/**
 * Returns a flat deduplicated list of all configured model IDs across all tasks.
 * Useful for pre-warming health entries and logging startup config.
 */
export function getAllConfiguredModels(
  envVars: Record<string, string | undefined> = {},
): ModelDescriptor[] {
  const seen  = new Set<string>();
  const result: ModelDescriptor[] = [];

  for (const task of Object.keys(DEFAULT_MODELS) as AITask[]) {
    for (const descriptor of getModelsForTask(task, envVars)) {
      if (!seen.has(descriptor.modelId)) {
        seen.add(descriptor.modelId);
        result.push(descriptor);
      }
    }
  }
  return result;
}
