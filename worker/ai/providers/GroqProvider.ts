/** GroqCloud provider using its OpenAI-compatible Chat Completions API. */

import { BaseProvider, categoryFromStatus, makeProviderError } from "./BaseProvider";
import type { AIProviderConfig, AIRequest, AIResponse } from "../types/index";
import { apiLogger, type GroqQuotaSnapshot } from "../../lib/apiLogger";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL_PREFIX = "groq/";
const FREE_TIER_MAX_OUTPUT_TOKENS = 1200;

interface GroqResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: { message?: string };
}

function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quotaSnapshot(response: Response): GroqQuotaSnapshot | undefined {
  const requestLimit = numericHeader(response, "x-ratelimit-limit-requests");
  const requestsRemaining = numericHeader(response, "x-ratelimit-remaining-requests");
  const tokenLimit = numericHeader(response, "x-ratelimit-limit-tokens");
  const tokensRemaining = numericHeader(response, "x-ratelimit-remaining-tokens");
  if ([requestLimit, requestsRemaining, tokenLimit, tokensRemaining].every((value) => value === null)) {
    return undefined;
  }
  return {
    label: requestsRemaining === null
      ? "Rate limits available"
      : `${requestsRemaining.toLocaleString()} daily requests remaining`,
    requestLimit,
    requestsRemaining,
    requestsReset: response.headers.get("x-ratelimit-reset-requests"),
    tokenLimit,
    tokensRemaining,
    tokensReset: response.headers.get("x-ratelimit-reset-tokens"),
    capturedAt: new Date().toISOString(),
  };
}

export class GroqProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super(config, GROQ_BASE_URL);
  }

  async complete(
    modelId: string,
    request: AIRequest,
  ): Promise<Omit<AIResponse, "attemptCount" | "latencyMs">> {
    const upstreamModelId = modelId.startsWith(GROQ_MODEL_PREFIX)
      ? modelId.slice(GROQ_MODEL_PREFIX.length)
      : modelId;

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: upstreamModelId,
          messages: request.messages,
          temperature: request.temperature ?? 0.1,
          max_tokens: Math.min(request.maxTokens ?? FREE_TIER_MAX_OUTPUT_TOKENS, FREE_TIER_MAX_OUTPUT_TOKENS),
          include_reasoning: false,
          reasoning_effort: "medium",
          ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    } catch (error) {
      throw makeProviderError(
        `Groq network error: ${error instanceof Error ? error.message : String(error)}`,
        "TIMEOUT",
      );
    }

    const data = (await response.json()) as GroqResponse;
    const quotaRemaining = quotaSnapshot(response);
    if (quotaRemaining) apiLogger.setQuotaCache("groq", quotaRemaining);

    if (!response.ok) {
      throw makeProviderError(
        data.error?.message ?? `Groq HTTP ${response.status}`,
        categoryFromStatus(response.status),
        response.status,
        { quotaRemaining },
      );
    }

    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw makeProviderError("Groq response reached its output token limit.", "PARSE_ERROR", response.status);
    }
    const content = choice?.message?.content?.trim() ?? "";
    if (!content) {
      throw makeProviderError("Groq returned empty content.", "SERVER_ERROR", response.status);
    }

    return {
      content: stripFences(content),
      modelUsed: data.model ?? upstreamModelId,
      providerUsed: this.id,
      finishReason: choice?.finish_reason,
      quotaRemaining,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}
