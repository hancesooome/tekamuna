/**
 * AI Layer — shared types
 *
 * These types are the contract between the rest of the application
 * and the AI orchestration layer. Nothing outside /worker/ai should
 * import from provider-specific files directly.
 */

// ── Task types ────────────────────────────────────────────────────────────────

/**
 * Named AI tasks. Each task can have its own preferred model order
 * configured in models.ts / environment variables.
 */
export type AITask =
  | "VERDICT"        // Main fact-check verdict — needs best reasoning
  | "SUMMARY"        // Summarise a source excerpt
  | "TRANSLATION"    // Filipino/Taglish translation
  | "SEARCH_QUERY"   // Generate optimised search queries
  | "EVIDENCE_EXTRACTION"; // Extract structured facts from text

// ── Request / Response ────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIRequest {
  task: AITask;
  messages: AIMessage[];
  /** Max tokens for the response. Defaults to 2048. */
  maxTokens?: number;
  /** Temperature. Defaults to 0.1 for deterministic fact-checking. */
  temperature?: number;
  /** Ask providers that support it to enforce a JSON object response. */
  jsonMode?: boolean;
  /** Reject unusable HTTP-200 content before AIManager marks an attempt successful. */
  validateContent?: (content: string) => void;
  /** Caller-supplied identifier for logging (e.g. claim fingerprint). */
  requestId?: string;
  /**
   * If set, skip all other providers and use only this one.
   * Matches the provider ID registered in AIManager: 'openrouter' | 'openrouter2' | 'gemini'.
   * Used by admin settings (ai_provider_mode) to force a specific provider.
   */
  forcedProvider?: string;
}

export interface AIResponse {
  content: string;
  /** Which model actually answered (provider:modelId). */
  modelUsed: string;
  /** Which provider answered (e.g. "openrouter", "gemini"). */
  providerUsed: string;
  /** Provider stop reason, when exposed by the upstream API. */
  finishReason?: string;
  /** Number of models tried before success. 1 = first model worked. */
  attemptCount: number;
  /** Wall-clock latency in ms. */
  latencyMs: number;
  /** Token usage, if reported by the provider. */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
  /** Quota remaining parsed from response headers, if available. */
  quotaRemaining?: import("../../lib/apiLogger").QuotaValue;
}

// ── Model health tracking ─────────────────────────────────────────────────────

export interface ModelHealth {
  modelId: string;
  providerId: string;
  successCount: number;
  failureCount: number;
  /** Rolling average latency over last 10 successful calls (ms). */
  avgLatencyMs: number;
  lastSuccessAt: number | null;   // epoch ms
  lastFailureAt: number | null;   // epoch ms
  lastFailureReason: string | null;
  /** If true, skip this model until cooldownUntil has passed. */
  cooledDown: boolean;
  cooldownUntil: number | null;   // epoch ms
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface AIProviderConfig {
  id: string;         // e.g. "openrouter", "gemini"
  apiKey: string;
  /** Optional base URL override. */
  baseUrl?: string;
}

// ── Model descriptor ──────────────────────────────────────────────────────────

export interface ModelDescriptor {
  /** Full model ID as the provider expects it. */
  modelId: string;
  /** Which provider handles this model. */
  providerId: string;
  /** Human-readable label for logs. */
  label?: string;
  /** Whether this is a free-tier model (no per-token cost). */
  free?: boolean;
}

// ── Retry-able error detection ────────────────────────────────────────────────

export type FailureCategory =
  | "RATE_LIMIT"       // 429
  | "SERVER_ERROR"     // 5xx
  | "TIMEOUT"          // network timeout
  | "MODEL_UNAVAILABLE"// 404 / model not found
  | "PARSE_ERROR"      // response not valid JSON
  | "INVALID_REQUEST"  // 400 / bad prompt — do NOT retry
  | "UNKNOWN";

export interface AIProviderError extends Error {
  category: FailureCategory;
  statusCode?: number;
  retryable: boolean;
  quotaRemaining?: import("../../lib/apiLogger").QuotaValue;
}
