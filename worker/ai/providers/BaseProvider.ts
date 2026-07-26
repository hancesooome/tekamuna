/**
 * BaseProvider — abstract interface all AI providers must implement.
 *
 * ── How to add a new provider ─────────────────────────────────────────────────
 * 1. Create /worker/ai/providers/<Name>Provider.ts
 * 2. Extend BaseProvider
 * 3. Implement complete() and normaliseError()
 * 4. Register the provider in AIManager.ts
 *
 * Providers are responsible for:
 *   - Translating AIRequest → provider-specific wire format
 *   - Translating provider response → AIResponse
 *   - Classifying errors into FailureCategory so AIManager can decide
 *     whether to retry or skip to next model
 *
 * Providers are NOT responsible for:
 *   - Retry logic (AIManager owns that)
 *   - Model selection (AIManager owns that)
 *   - Health tracking (AIManager owns that)
 */

import type {
  AIRequest,
  AIResponse,
  AIProviderConfig,
  AIProviderError,
  FailureCategory,
} from "../types/index";

// ── Error helper ──────────────────────────────────────────────────────────────

/**
 * Creates a typed AIProviderError.
 * Providers call this to produce consistently-shaped errors that
 * AIManager can inspect without parsing message strings.
 */
export function makeProviderError(
  message: string,
  category: FailureCategory,
  statusCode?: number,
): AIProviderError {
  const err = new Error(message) as AIProviderError;
  err.category  = category;
  err.statusCode = statusCode;
  err.retryable = isRetryable(category);
  return err;
}

/**
 * Retryable categories: move to next model.
 * Non-retryable: propagate immediately (bad request, parse error).
 */
export function isRetryable(category: FailureCategory): boolean {
  return (
    category === "RATE_LIMIT"        ||
    category === "SERVER_ERROR"      ||
    category === "TIMEOUT"           ||
    category === "MODEL_UNAVAILABLE" ||
    category === "UNKNOWN"
  );
}

/**
 * Maps an HTTP status code to a FailureCategory.
 */
export function categoryFromStatus(status: number): FailureCategory {
  if (status === 429)              return "RATE_LIMIT";
  if (status === 404)              return "MODEL_UNAVAILABLE";
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status >= 500)               return "SERVER_ERROR";
  return "UNKNOWN";
}

// ── Abstract base ─────────────────────────────────────────────────────────────

export abstract class BaseProvider {
  readonly id: string;

  protected readonly apiKey: string;
  protected readonly baseUrl: string;

  constructor(config: AIProviderConfig, defaultBaseUrl: string) {
    this.id      = config.id;
    this.apiKey  = config.apiKey;
    this.baseUrl = config.baseUrl ?? defaultBaseUrl;
  }

  /**
   * Send a request to the AI provider for the given modelId.
   *
   * @throws AIProviderError — always throw a typed error, never raw Error.
   *         AIManager inspects err.category and err.retryable to decide
   *         whether to retry this model or move to the next one.
   */
  abstract complete(
    modelId: string,
    request: AIRequest,
  ): Promise<Omit<AIResponse, "attemptCount" | "latencyMs">>;

  /**
   * Human-readable label for logs.
   */
  toString(): string {
    return `[${this.id}]`;
  }
}
