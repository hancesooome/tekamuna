/**
 * AIManager — Central AI Orchestration Layer
 *
 * This is the ONLY entry point for all AI requests in the application.
 * No other file should call OpenRouter or Gemini directly.
 *
 * Responsibilities:
 *   - Select the best available model for a given task
 *   - Retry failed requests on the next model automatically
 *   - Track health metrics per model (success rate, latency, failures)
 *   - Deprioritise unhealthy models with a cooldown mechanism
 *   - Log every request with full diagnostic details
 *   - Surface a clean AIResponse — callers never know which model answered
 *
 * ── How fallback works ────────────────────────────────────────────────────────
 * For each request, AIManager iterates the model list for the task in order:
 *   1. Skip cooled-down models (temporarily deprioritised after repeated failures)
 *   2. Try the model via its provider
 *   3. On retryable failure → log, update health, move to next model
 *   4. On non-retryable failure (400/invalid) → stop immediately
 *   5. If all models exhausted → throw AIExhaustedError
 *
 * ── How retries work ─────────────────────────────────────────────────────────
 * Each model is tried ONCE before moving to the next.
 * We do not retry the same model — the model list IS the retry list.
 * Cooled-down models are skipped but re-evaluated after COOLDOWN_MS.
 *
 * ── How health tracking works ────────────────────────────────────────────────
 * Health state lives in-process (Worker memory).
 * In Cloudflare Workers each isolate has its own state, so this is
 * per-isolate but still effective for catching quota errors within a session.
 *
 * ── How to add a provider ────────────────────────────────────────────────────
 * 1. Implement BaseProvider in /providers/<Name>Provider.ts
 * 2. Import it here and add to the providers Map in the constructor
 * 3. Update resolveProvider() in config/models.ts to route model IDs to it
 */

import type {
  AIRequest,
  AIResponse,
  ModelHealth,
  AIProviderConfig,
} from "./types/index";
// AIRequest      → what we send to the AI: { task, messages, maxTokens, temperature }
// AIResponse     → what we receive back: { content, modelUsed, providerUsed, latencyMs, ... }
// ModelHealth    → per-model health state: { successCount, failureCount, cooledDown, ... }
// AIProviderConfig → { id: string, apiKey: string }

import { OpenRouterProvider } from "./providers/OpenRouterProvider";
// OpenRouter is a unified API that routes to many free/paid AI models
// (DeepSeek, Qwen, Mistral, etc.) — one API key, many models.

import { GeminiProvider }      from "./providers/GeminiProvider";
// GeminiProvider calls Google's Gemini API directly — used as a fallback.

import { getModelsForTask, getAllConfiguredModels } from "./config/models";
// getModelsForTask(task, envVars) → returns ordered list of model descriptors for a task
// getAllConfiguredModels(envVars) → returns all models across all tasks (for health pre-warming)

import type { BaseProvider } from "./providers/BaseProvider";
import { apiLogger, type ApiName, type QuotaValue } from "../lib/apiLogger";
// BaseProvider is the abstract interface both OpenRouterProvider and GeminiProvider implement.
// This lets AIManager work with any provider without knowing its specifics (polymorphism).

// ── Constants ─────────────────────────────────────────────────────────────────

/** After this many consecutive failures, a model enters cooldown. */
const FAILURE_THRESHOLD = 3;

/** How long a model stays in cooldown before being retried (ms). */
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (in milliseconds: 5 * 60 * 1000 = 300000)

/** Rolling window size for average latency calculation. */
const LATENCY_WINDOW = 10; // Use the last 10 requests to compute rolling average

// ── Error types ───────────────────────────────────────────────────────────────

/**
 * Thrown when every AI model in the list has failed or is in cooldown.
 * Callers should catch this and return a graceful fallback to the user.
 */
export class AIExhaustedError extends Error {
  constructor(
    public readonly task: string, // e.g. "VERDICT"
    public readonly attempts: Array<{ modelId: string; reason: string }>, // what failed and why
  ) {
    super(
      // Template literal builds a human-readable summary of all failures.
      `All AI models exhausted for task "${task}". ` +
      `Tried: ${attempts.map((a) => `${a.modelId} (${a.reason})`).join(", ")}`,
    );
    this.name = "AIExhaustedError"; // Overrides "Error" in stack traces
  }
}

// ── Log entry (AIManager diagnostics — also mirrored to apiLogger) ────────────
interface RequestLog {
  requestId:    string;
  task:         string;
  modelUsed:    string;
  providerUsed: string;
  attemptCount: number;
  latencyMs:    number;
  success:      boolean;
  fallbackUsed: boolean;
  failureReason?: string;
  retryChain:   Array<{ modelId: string; reason: string }>;
  tokenUsage?:  AIResponse["usage"];
  timestamp:    string;
  apiLogId?:    string;
}

const PROVIDER_ENDPOINTS: Record<string, string> = {
  openrouter:  "https://openrouter.ai/api/v1/chat/completions",
  openrouter2: "https://openrouter.ai/api/v1/chat/completions",
  gemini:      "https://generativelanguage.googleapis.com/v1beta/models",
};

// ── AIManager ─────────────────────────────────────────────────────────────────

export class AIManager {
  // Maps are key-value stores like objects, but more flexible.
  // We use string keys for provider IDs (e.g. "openrouter", "gemini").

  /** Registered providers keyed by provider ID. */
  private readonly providers = new Map<string, BaseProvider>();
  // `private` = only accessible within this class (not from outside)
  // `readonly` = the Map itself can't be reassigned (but its contents can change)

  /** Per-model health state. Key = modelId (or modelId__key2 for second key). */
  private readonly health = new Map<string, ModelHealth>();

  /** Request log (kept in memory, last 100 entries). */
  private readonly logs: RequestLog[] = [];

  /** Environment variables for runtime model config. */
  private readonly envVars: Record<string, string | undefined>;

  constructor(
    providerConfigs: {
      openrouter?:  AIProviderConfig; // ? = optional provider
      openrouter2?: AIProviderConfig; // second OpenRouter key — used when first is exhausted
      gemini?:      AIProviderConfig;
    },
    envVars: Record<string, string | undefined> = {}, // Default to empty object
  ) {
    this.envVars = envVars;

    // Register providers — only those with valid API keys get registered.
    // Providers without keys are simply not added to the Map.
    if (providerConfigs.openrouter?.apiKey) {
      this.providers.set("openrouter", new OpenRouterProvider(providerConfigs.openrouter));
    }
    if (providerConfigs.openrouter2?.apiKey) {
      this.providers.set("openrouter2", new OpenRouterProvider(providerConfigs.openrouter2));
    }
    if (providerConfigs.gemini?.apiKey) {
      this.providers.set("gemini", new GeminiProvider(providerConfigs.gemini));
    }

    // Pre-warm health entries for all configured models.
    // "Pre-warming" means we create the health state objects before any request,
    // so the first request doesn't need to create them mid-flight.
    for (const descriptor of getAllConfiguredModels(envVars)) {
      this.ensureHealth(descriptor.modelId, descriptor.providerId);
      // Also pre-warm the "key2 mirror" entries — modelId__key2 tracks health
      // for the same model when called via the second OpenRouter key.
      if (descriptor.providerId === "openrouter" && providerConfigs.openrouter2?.apiKey) {
        this.ensureHealth(`${descriptor.modelId}__key2`, "openrouter2");
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Send an AI request. Automatically selects the best model for the task,
   * retries on failure, and returns a clean AIResponse.
   *
   * @throws AIExhaustedError if every model in the list fails
   */
  async complete(request: AIRequest): Promise<AIResponse> {
    // Get the ordered model list for this task.
    // e.g. for "VERDICT": [deepseek-chat:free, qwen3-32b:free, gemini-flash]
    const models    = getModelsForTask(request.task, this.envVars);
    const requestId = request.requestId ?? this.generateId(); // Use provided ID or generate one
    const retryChain: Array<{ modelId: string; reason: string }> = []; // Tracks all failures
    let attemptCount = 0;

    // Iterate over each model descriptor in priority order.
    for (const descriptor of models) {
      const { modelId } = descriptor;

      // For each model, we try two "slots":
      //   1. Primary key (openrouter provider)
      //   2. Key2 slot (openrouter2 provider, same model — different API key)
      // This doubles our effective quota for free-tier models.
      // NOTE: the key2 slot is only valid for openrouter models — Gemini (and
      // any future non-OpenRouter provider) must not be sent to openrouter2.
      const attempts: Array<{ healthKey: string; providerId: string }> = [
        { healthKey: modelId, providerId: descriptor.providerId }, // Primary key
        // Only add the key2 slot when the model actually belongs to OpenRouter.
        // Sending "gemini-2.0-flash" to openrouter2 causes a 400 invalid-model error.
        ...(descriptor.providerId === "openrouter"
          ? [{ healthKey: `${modelId}__key2`, providerId: "openrouter2" }]
          : []),
      ];

      for (const { healthKey, providerId } of attempts) {
        // Respect forcedProvider setting if provided
        if (request.forcedProvider && request.forcedProvider !== providerId) {
          continue;
        }

        // Skip this slot if the provider isn't registered (no API key for it).
        if (!this.providers.has(providerId)) continue;

        // Get (or create) the health state for this model/key combination.
        const health = this.ensureHealth(healthKey, providerId);

        // Skip if this model is in cooldown (too many recent failures).
        if (this.isCooledDown(health)) {
          const remaining = Math.ceil(((health.cooldownUntil ?? 0) - Date.now()) / 1000);
          // Math.ceil rounds up: 60.1 seconds → 61 (more informative than 60)
          retryChain.push({ modelId: healthKey, reason: `cooldown (${remaining}s left)` });
          this.log(`[AIManager] Skipping ${providerId}/${modelId} — in cooldown for ${remaining}s`);
          continue; // Move to next slot
        }

        // Get the actual provider implementation.
        const provider = this.providers.get(providerId);
        if (!provider) continue; // Defensive check (shouldn't happen if logic above is correct)

        attemptCount++;
        const startMs = Date.now(); // Record start time for latency measurement

        try {
          const fallbackSuffix = retryChain.length > 0
            ? ` (fallback after ${retryChain.length} earlier failure${retryChain.length === 1 ? "" : "s"})`
            : "";
          this.log(
            `[AIManager] Attempt ${attemptCount}: ${providerId}/${modelId}${fallbackSuffix}`,
          );

          // ── The actual AI call ──────────────────────────────────────────
          // provider.complete() sends the request to OpenRouter or Gemini.
          // It throws on any failure (network, quota, bad response, etc.).
          const partial = await provider.complete(modelId, request);
          const latencyMs = Date.now() - startMs; // Elapsed time in milliseconds

          // Record success in health state (resets failure count, updates latency).
          this.recordSuccess(health, latencyMs);

          // Assemble the full AIResponse (add metadata that providers don't include).
          const response: AIResponse = { ...partial, attemptCount, latencyMs };
          // `...partial` spreads all fields from the provider response
          // then we add/override attemptCount and latencyMs

          const apiLogEntry = this.logToApiLogger({
            providerId,
            modelId,
            latencyMs,
            success:    true,
            statusCode: 200,
            responseBody: { modelUsed: modelId, usage: partial.usage },
            quotaRemaining: partial.quotaRemaining,
          });

          this.pushLog({
            requestId,
            task:         request.task,
            modelUsed:    modelId,
            providerUsed: providerId,
            attemptCount,
            latencyMs,
            success:      true,
            fallbackUsed: attemptCount > 1,
            retryChain,
            tokenUsage:   partial.usage,
            timestamp:    new Date().toISOString(),
            apiLogId:     apiLogEntry.id,
          });

          this.log(
            `[AIManager] ✓ ${providerId}/${modelId} — ${latencyMs}ms` +
            (partial.usage ? ` — ${partial.usage.totalTokens} tokens` : "") +
            (attemptCount > 1
              ? ` — fallback succeeded after ${retryChain.length} previous failure${retryChain.length === 1 ? "" : "s"}`
              : ""),
          );

          return response; // SUCCESS — return to the caller immediately

        } catch (err) {
          const latencyMs = Date.now() - startMs;
          // err could be any type — we safely extract the message string.
          const msg       = err instanceof Error ? err.message : String(err);
          // Check if the error is retryable (should we try the next model?).
          // If the error object doesn't have `retryable`, assume it IS retryable.
          const retryable = err instanceof Error && "retryable" in err
            ? (err as { retryable: boolean }).retryable
            : true;
          const statusCode =
            err instanceof Error && "statusCode" in err
              ? (err as { statusCode?: number }).statusCode
              : undefined;
          const isUnavailable =
            statusCode === 404 ||
            msg.toLowerCase().includes("no endpoints found") ||
            msg.toLowerCase().includes("model not found");

          // Update health state (may trigger cooldown if too many failures).
          this.recordFailure(health, msg);
          retryChain.push({ modelId: healthKey, reason: msg.slice(0, 120) });
          // .slice(0, 120) limits the error message length in logs

          this.log(
            `[AIManager] ✗ ${providerId}/${modelId} failed in ${latencyMs}ms: ${msg.slice(0, 120)}`,
          );
          if (isUnavailable) {
            this.log(
              `[AIManager] ${providerId}/${modelId} unavailable (${statusCode ?? "no status"}); trying next configured model`,
            );
          }

          // Non-retryable errors (e.g. 400 Bad Request = invalid prompt):
          // No point trying other models with the same bad input — throw immediately.
          if (!retryable) {
            const apiLogEntry = this.logToApiLogger({
              providerId,
              modelId,
              latencyMs,
              success:      false,
              statusCode,
              errorMessage: msg,
              quotaRemaining: this.quotaFromError(err),
            });

            this.pushLog({
              requestId,
              task:         request.task,
              modelUsed:    modelId,
              providerUsed: providerId,
              attemptCount,
              latencyMs,
              success:      false,
              fallbackUsed: attemptCount > 1,
              failureReason: msg,
              retryChain,
              timestamp:    new Date().toISOString(),
              apiLogId:     apiLogEntry.id,
            });
            throw err;
          }

          this.logToApiLogger({
            providerId,
            modelId,
            latencyMs,
            success:      false,
            statusCode:
              err instanceof Error && "statusCode" in err
                ? (err as { statusCode?: number }).statusCode
                : undefined,
            errorMessage: msg,
            quotaRemaining: this.quotaFromError(err),
          });

          // Retryable failure → loop to next key slot or next model.
          continue;
        }
      } // end: for each key slot
    } // end: for each model

    // ── All models + all keys exhausted ───────────────────────────────────
    // We tried every model in every slot and all failed.
    this.pushLog({
      requestId,
      task:         request.task,
      modelUsed:    "none",
      providerUsed: "none",
      attemptCount,
      latencyMs:    0,
      success:      false,
      fallbackUsed: attemptCount > 1,
      failureReason: "all models exhausted",
      retryChain,
      timestamp:    new Date().toISOString(),
    });

    // Throw AIExhaustedError — gemini.ts catches this and returns a fallback result.
    throw new AIExhaustedError(request.task, retryChain);
  }

  /**
   * Returns current health snapshot for all tracked models.
   * Useful for the /api/health endpoint.
   */
  getHealthSnapshot(): ModelHealth[] {
    // Array.from converts the Map's values (ModelHealth objects) to a plain array.
    return Array.from(this.health.values());
  }

  /**
   * Returns the last N request logs (default 20).
   * .slice(-n) = last N elements of an array (negative index counts from the end).
   */
  getRecentLogs(n = 20): RequestLog[] {
    return this.logs.slice(-n);
  }

  // ── Health management ───────────────────────────────────────────────────────

  /**
   * Gets the health entry for a model, or creates a fresh one if it doesn't exist.
   * "ensure" = get-or-create pattern.
   */
  private ensureHealth(modelId: string, providerId: string): ModelHealth {
    if (!this.health.has(modelId)) {
      // Create a fresh health entry with all counters at zero.
      this.health.set(modelId, {
        modelId,
        providerId,
        successCount:      0,
        failureCount:      0,
        avgLatencyMs:      0,
        lastSuccessAt:     null, // null = never succeeded
        lastFailureAt:     null,
        lastFailureReason: null,
        cooledDown:        false,
        cooldownUntil:     null,
      });
    }
    // ! (non-null assertion): we just set it above, so .get() is guaranteed to return a value.
    return this.health.get(modelId)!;
  }

  /** Updates health state after a successful AI call. */
  private recordSuccess(health: ModelHealth, latencyMs: number): void {
    health.successCount++;
    health.lastSuccessAt = Date.now(); // Unix timestamp in milliseconds
    health.cooledDown    = false;      // Reset cooldown on success
    health.cooldownUntil = null;

    // Rolling average latency: gives more weight to recent calls.
    // Formula: avg = (oldAvg * (window - 1) + newValue) / window
    // Example: if oldAvg=500ms, newLatency=200ms, window=10:
    //   new avg = (500 * 9 + 200) / 10 = 470ms (slowly trending toward faster)
    const w = LATENCY_WINDOW;
    health.avgLatencyMs =
      health.avgLatencyMs === 0
        ? latencyMs  // First call: just use the actual latency
        : Math.round((health.avgLatencyMs * (w - 1) + latencyMs) / w);
  }

  /** Updates health state after a failed AI call. May trigger cooldown. */
  private recordFailure(health: ModelHealth, reason: string): void {
    health.failureCount++;
    health.lastFailureAt     = Date.now();
    health.lastFailureReason = reason.slice(0, 200); // Truncate long error messages

    const lower = reason.toLowerCase(); // Normalise for keyword matching

    // Quota/credit errors: immediately cool down — retrying right away is pointless.
    // These keywords identify quota exhaustion from both OpenRouter and Gemini.
    const isQuotaError =
      lower.includes("quota") ||
      lower.includes("rate limit") ||
      lower.includes("resource_exhausted") ||  // Gemini's error code
      lower.includes("afford") ||              // OpenRouter: "can only afford X tokens"
      lower.includes("credits") ||             // OpenRouter credit balance errors
      lower.includes("429");                   // HTTP 429 = Too Many Requests

    if (isQuotaError) {
      health.cooledDown    = true;
      health.cooldownUntil = Date.now() + COOLDOWN_MS; // Unix ms: current time + 5 minutes
      this.log(
        `[AIManager] Model ${health.modelId} entering ${COOLDOWN_MS / 1000}s cooldown immediately (quota/credits exhausted)`,
      );
      return; // Early return — don't check failure rate threshold below
    }

    // For non-quota errors: cool down after FAILURE_THRESHOLD failures with > 50% failure rate.
    // This prevents endlessly retrying a broken model, but allows occasional flaky failures.
    const failureRate =
      health.failureCount /
      Math.max(1, health.failureCount + health.successCount);
      // Math.max(1, ...) prevents division by zero on the first call

    if (health.failureCount >= FAILURE_THRESHOLD && failureRate > 0.5) {
      health.cooledDown    = true;
      health.cooldownUntil = Date.now() + COOLDOWN_MS;
      this.log(
        `[AIManager] Model ${health.modelId} entering ${COOLDOWN_MS / 1000}s cooldown ` +
        `(${health.failureCount} failures, ${Math.round(failureRate * 100)}% failure rate)`,
      );
    }
  }

  /** Returns true if a model is currently in its cooldown period. */
  private isCooledDown(health: ModelHealth): boolean {
    if (!health.cooledDown) return false; // Not in cooldown at all

    // Check if the cooldown period has expired.
    if (health.cooldownUntil && Date.now() > health.cooldownUntil) {
      // Cooldown expired — automatically re-enable the model.
      health.cooledDown    = false;
      health.cooldownUntil = null;
      this.log(`[AIManager] Model ${health.modelId} cooldown expired — re-enabling`);
      return false; // Not cooled down anymore
    }

    return true; // Still in cooldown
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  /** Writes a log line to console (visible in Cloudflare Workers log tail). */
  private log(_msg: string): void {
    // Intentionally silent in production.
    // Re-enable for debugging: console.info(_msg);
  }

  /** Appends a structured log entry and trims the buffer to 100 entries. */
  private pushLog(entry: RequestLog): void {
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
  }

  /** Mirror provider calls to the centralized apiLogger. */
  private logToApiLogger(params: {
    providerId: string;
    modelId: string;
    latencyMs: number;
    success: boolean;
    statusCode?: number;
    errorMessage?: string;
    responseBody?: unknown;
    quotaRemaining?: QuotaValue;
  }) {
    const apiName = params.providerId as ApiName;
    const endpoint =
      apiName === "gemini"
        ? `${PROVIDER_ENDPOINTS.gemini}/${params.modelId}:generateContent`
        : PROVIDER_ENDPOINTS[params.providerId] ?? params.providerId;

    if (params.quotaRemaining !== undefined) {
      apiLogger.setQuotaCache(apiName, params.quotaRemaining);
    }

    return apiLogger.log({
      apiName,
      endpoint,
      method:       "POST",
      durationMs:   params.latencyMs,
      success:      params.success,
      statusCode:   params.statusCode,
      errorMessage: params.errorMessage,
      responseBody: params.responseBody,
      quotaRemaining: params.quotaRemaining,
    });
  }

  private quotaFromError(err: unknown): QuotaValue | undefined {
    if (err instanceof Error && "quotaRemaining" in err) {
      return (err as { quotaRemaining?: QuotaValue }).quotaRemaining;
    }
    return undefined;
  }

  /** Generates a unique request ID using timestamp + random suffix. */
  private generateId(): string {
    // Date.now().toString(36) = current Unix ms in base-36 (shorter than decimal)
    // Math.random().toString(36).slice(2, 7) = 5 random base-36 chars
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }
}
