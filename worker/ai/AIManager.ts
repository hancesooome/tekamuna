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
import { OpenRouterProvider } from "./providers/OpenRouterProvider";
import { GeminiProvider }      from "./providers/GeminiProvider";
import { getModelsForTask, getAllConfiguredModels } from "./config/models";
import type { BaseProvider } from "./providers/BaseProvider";

// ── Constants ─────────────────────────────────────────────────────────────────

/** After this many consecutive failures, a model enters cooldown. */
const FAILURE_THRESHOLD = 3;

/** How long a model stays in cooldown before being retried (ms). */
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Rolling window size for average latency calculation. */
const LATENCY_WINDOW = 10;

// ── Error types ───────────────────────────────────────────────────────────────

export class AIExhaustedError extends Error {
  constructor(
    public readonly task: string,
    public readonly attempts: Array<{ modelId: string; reason: string }>,
  ) {
    super(
      `All AI models exhausted for task "${task}". ` +
      `Tried: ${attempts.map((a) => `${a.modelId} (${a.reason})`).join(", ")}`,
    );
    this.name = "AIExhaustedError";
  }
}

// ── Log entry ─────────────────────────────────────────────────────────────────

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
}

// ── AIManager ─────────────────────────────────────────────────────────────────

export class AIManager {
  /** Registered providers keyed by provider ID. */
  private readonly providers = new Map<string, BaseProvider>();

  /** Per-model health state. Key = modelId. */
  private readonly health = new Map<string, ModelHealth>();

  /** Request log (kept in memory, last 100 entries). */
  private readonly logs: RequestLog[] = [];

  /** Environment variables for runtime model config. */
  private readonly envVars: Record<string, string | undefined>;

  constructor(
    providerConfigs: {
      openrouter?:  AIProviderConfig;
      openrouter2?: AIProviderConfig;  // second OpenRouter key — used when first is exhausted
      gemini?:      AIProviderConfig;
    },
    envVars: Record<string, string | undefined> = {},
  ) {
    this.envVars = envVars;

    // Register providers
    if (providerConfigs.openrouter?.apiKey) {
      this.providers.set("openrouter", new OpenRouterProvider(providerConfigs.openrouter));
    }
    if (providerConfigs.openrouter2?.apiKey) {
      this.providers.set("openrouter2", new OpenRouterProvider(providerConfigs.openrouter2));
    }
    if (providerConfigs.gemini?.apiKey) {
      this.providers.set("gemini", new GeminiProvider(providerConfigs.gemini));
    }

    // Pre-warm health entries for all configured models
    for (const descriptor of getAllConfiguredModels(envVars)) {
      this.ensureHealth(descriptor.modelId, descriptor.providerId);
      // Also pre-warm the openrouter2 mirror entries
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
    const models    = getModelsForTask(request.task, this.envVars);
    const requestId = request.requestId ?? this.generateId();
    const retryChain: Array<{ modelId: string; reason: string }> = [];
    let attemptCount = 0;

    for (const descriptor of models) {
      const { modelId } = descriptor;

      // Build attempt list: try primary key first, then key2 for same model
      const attempts: Array<{ healthKey: string; providerId: string }> = [
        { healthKey: modelId,          providerId: descriptor.providerId },
        { healthKey: `${modelId}__key2`, providerId: "openrouter2" },
      ];

      for (const { healthKey, providerId } of attempts) {
        // Skip key2 slot if openrouter2 provider isn't registered
        if (!this.providers.has(providerId)) continue;

        const health = this.ensureHealth(healthKey, providerId);

        // Skip cooled-down models
        if (this.isCooledDown(health)) {
          const remaining = Math.ceil(((health.cooldownUntil ?? 0) - Date.now()) / 1000);
          retryChain.push({ modelId: healthKey, reason: `cooldown (${remaining}s left)` });
          this.log(`[AIManager] Skipping ${providerId}/${modelId} — in cooldown for ${remaining}s`);
          continue;
        }

        const provider = this.providers.get(providerId);
        if (!provider) continue;

        attemptCount++;
        const startMs = Date.now();

        try {
          this.log(
            `[AIManager] Attempt ${attemptCount}: ${providerId}/${modelId}` +
            (retryChain.length > 0 ? ` (fallback after ${retryChain.length} failures)` : ""),
          );

          const partial = await provider.complete(modelId, request);
          const latencyMs = Date.now() - startMs;

          this.recordSuccess(health, latencyMs);

          const response: AIResponse = { ...partial, attemptCount, latencyMs };

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
          });

          this.log(
            `[AIManager] ✓ ${providerId}/${modelId} — ${latencyMs}ms` +
            (partial.usage ? ` — ${partial.usage.totalTokens} tokens` : "") +
            (attemptCount > 1 ? ` — fallback #${attemptCount}` : ""),
          );

          return response;

        } catch (err) {
          const latencyMs = Date.now() - startMs;
          const msg       = err instanceof Error ? err.message : String(err);
          const retryable = err instanceof Error && "retryable" in err
            ? (err as { retryable: boolean }).retryable
            : true;

          this.recordFailure(health, msg);
          retryChain.push({ modelId: healthKey, reason: msg.slice(0, 120) });

          this.log(
            `[AIManager] ✗ ${providerId}/${modelId} failed in ${latencyMs}ms: ${msg.slice(0, 120)}`,
          );

          // Non-retryable — stop entirely
          if (!retryable) {
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
            });
            throw err;
          }

          // Continue to next key slot (key2) or next model
          continue;
        }
      }
    }

    // All models + all keys exhausted
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

    throw new AIExhaustedError(request.task, retryChain);
  }

  /**
   * Returns current health snapshot for all tracked models.
   * Useful for the /api/health endpoint.
   */
  getHealthSnapshot(): ModelHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Returns the last N request logs (default 20).
   */
  getRecentLogs(n = 20): RequestLog[] {
    return this.logs.slice(-n);
  }

  // ── Health management ───────────────────────────────────────────────────────

  private ensureHealth(modelId: string, providerId: string): ModelHealth {
    if (!this.health.has(modelId)) {
      this.health.set(modelId, {
        modelId,
        providerId,
        successCount:      0,
        failureCount:      0,
        avgLatencyMs:      0,
        lastSuccessAt:     null,
        lastFailureAt:     null,
        lastFailureReason: null,
        cooledDown:        false,
        cooldownUntil:     null,
      });
    }
    return this.health.get(modelId)!;
  }

  private recordSuccess(health: ModelHealth, latencyMs: number): void {
    health.successCount++;
    health.lastSuccessAt = Date.now();
    health.cooledDown    = false;
    health.cooldownUntil = null;

    // Rolling average latency
    const w = LATENCY_WINDOW;
    health.avgLatencyMs =
      health.avgLatencyMs === 0
        ? latencyMs
        : Math.round((health.avgLatencyMs * (w - 1) + latencyMs) / w);
  }

  private recordFailure(health: ModelHealth, reason: string): void {
    health.failureCount++;
    health.lastFailureAt     = Date.now();
    health.lastFailureReason = reason.slice(0, 200);

    const lower = reason.toLowerCase();

    // Immediately cool down on quota / credit exhaustion — no point retrying
    const isQuotaError =
      lower.includes("quota") ||
      lower.includes("rate limit") ||
      lower.includes("resource_exhausted") ||
      lower.includes("afford") ||      // OpenRouter "can only afford X tokens"
      lower.includes("credits") ||     // OpenRouter credit errors
      lower.includes("429");

    if (isQuotaError) {
      health.cooledDown    = true;
      health.cooldownUntil = Date.now() + COOLDOWN_MS;
      this.log(
        `[AIManager] Model ${health.modelId} entering ${COOLDOWN_MS / 1000}s cooldown immediately (quota/credits exhausted)`,
      );
      return;
    }

    // For other errors: cool down after FAILURE_THRESHOLD failures
    const failureRate =
      health.failureCount /
      Math.max(1, health.failureCount + health.successCount);

    if (health.failureCount >= FAILURE_THRESHOLD && failureRate > 0.5) {
      health.cooledDown    = true;
      health.cooldownUntil = Date.now() + COOLDOWN_MS;
      this.log(
        `[AIManager] Model ${health.modelId} entering ${COOLDOWN_MS / 1000}s cooldown ` +
        `(${health.failureCount} failures, ${Math.round(failureRate * 100)}% failure rate)`,
      );
    }
  }

  private isCooledDown(health: ModelHealth): boolean {
    if (!health.cooledDown) return false;
    if (health.cooldownUntil && Date.now() > health.cooldownUntil) {
      // Cooldown expired — reset
      health.cooledDown    = false;
      health.cooldownUntil = null;
      this.log(`[AIManager] Model ${health.modelId} cooldown expired — re-enabling`);
      return false;
    }
    return true;
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  private log(msg: string): void {
    console.info(msg);
  }

  private pushLog(entry: RequestLog): void {
    this.logs.push(entry);
    // Keep only the last 100 entries to avoid unbounded memory growth
    if (this.logs.length > 100) this.logs.shift();
  }

  private generateId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }
}
