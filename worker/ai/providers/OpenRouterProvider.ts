/**
 * OpenRouterProvider
 *
 * Routes requests to any model available on OpenRouter's API.
 * OpenRouter uses an OpenAI-compatible chat completions endpoint,
 * so this provider works for all models hosted there regardless of
 * the underlying model family.
 *
 * ── How to add a new OpenRouter model ────────────────────────────────────────
 * Just add the model ID to /worker/ai/config/models.ts — no code changes here.
 * OpenRouter model IDs follow the pattern: "provider/model-name[:free]"
 * Full list: https://openrouter.ai/models
 */

import { BaseProvider, makeProviderError, categoryFromStatus } from "./BaseProvider";
import type { AIRequest, AIResponse, AIProviderConfig } from "../types/index";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── Wire types ────────────────────────────────────────────────────────────────

interface ORResponse {
  id?: string;
  choices?: Array<{
    message: { role: string; content: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // OpenRouter cost field (may not always be present)
  cost?: number;
  error?: {
    message: string;
    code?: number | string;
    metadata?: { reasons?: string[] };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  // Step 1: strip markdown fences
  let s = text
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  // Step 2: find first '{'
  const objStart = s.indexOf("{");
  if (objStart === -1) return s;
  s = s.slice(objStart);

  // Step 3: walk forward with brace-depth tracking to find matching '}'
  let depth = 0;
  let inString = false;
  let escape = false;
  let objEnd = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape)     { escape = false; continue; }
    if (ch === "\\") { escape = true;  continue; }
    if (ch === '"')  { inString = !inString; continue; }
    if (inString)    continue;
    if (ch === "{")  { depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0) { objEnd = i; break; }
    }
  }

  return objEnd !== -1
    ? s.slice(0, objEnd + 1)
    : s.slice(0, s.lastIndexOf("}") + 1) || s;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OpenRouterProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super(config, OPENROUTER_BASE_URL);
  }

  async complete(
    modelId: string,
    request: AIRequest,
  ): Promise<Omit<AIResponse, "attemptCount" | "latencyMs">> {

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer":  "https://teka-nga.pages.dev",
          "X-Title":       "Teka Muna Fact Checker",
        },
        body: JSON.stringify({
          model:       modelId,
          messages:    request.messages,
          temperature: request.temperature ?? 0.1,
          max_tokens:  request.maxTokens   ?? 2048,
        }),
      });
    } catch (networkErr) {
      throw makeProviderError(
        `Network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
        "TIMEOUT",
      );
    }

    const data = (await response.json()) as ORResponse;

    // ── Error response ──────────────────────────────────────────────────────
    if (!response.ok) {
      const rawMsg  = data.error?.message ?? `HTTP ${response.status}`;
      const reasons = data.error?.metadata?.reasons?.join(", ") ?? "";
      const fullMsg = reasons ? `${rawMsg} (${reasons})` : rawMsg;
      const category = categoryFromStatus(response.status);
      throw makeProviderError(fullMsg, category, response.status);
    }

    // ── Empty / missing content ─────────────────────────────────────────────
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw makeProviderError(
        "OpenRouter returned empty content.",
        "SERVER_ERROR",
        response.status,
      );
    }

    // ── Usage ───────────────────────────────────────────────────────────────
    const usage = data.usage
      ? {
          promptTokens:     data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens:      data.usage.total_tokens,
          costUsd:          data.cost,
        }
      : undefined;

    return {
      content:      stripFences(content),
      modelUsed:    modelId,
      providerUsed: this.id,
      usage,
    };
  }
}
