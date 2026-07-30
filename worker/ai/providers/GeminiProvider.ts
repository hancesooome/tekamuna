/**
 * GeminiProvider
 *
 * Routes requests directly to Google's Generative Language API
 * (Gemini models accessed via API key, not through OpenRouter).
 *
 * ── How to add a new Gemini model ────────────────────────────────────────────
 * Add the model ID (e.g. "gemini-2.0-flash") to /worker/ai/config/models.ts.
 * The resolveProvider() function routes "gemini-*" IDs here automatically.
 *
 * ── Quota behaviour ───────────────────────────────────────────────────────────
 * Gemini free tier resets daily. When quota is exhausted the API returns
 * RESOURCE_EXHAUSTED (429). AIManager will move to the next model.
 */

import { BaseProvider, makeProviderError, categoryFromStatus } from "./BaseProvider";
import type { AIRequest, AIResponse, AIProviderConfig } from "../types/index";
import { parseGeminiQuotaHeaders } from "../../lib/quotaFetcher";
import { apiLogger } from "../../lib/apiLogger";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ── Wire types ────────────────────────────────────────────────────────────────

interface GeminiCandidate {
  content: { parts: Array<{ text: string }> };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message: string; code: number; status?: string };
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUOTA_PHRASES = ["quota", "rate limit", "resource_exhausted", "429"];

function isQuotaMessage(msg: string): boolean {
  return QUOTA_PHRASES.some((p) => msg.toLowerCase().includes(p));
}

function stripFences(text: string): string {
  let s = text
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const objStart = s.indexOf("{");
  if (objStart === -1) return s;
  s = s.slice(objStart);

  let depth = 0, inString = false, escape = false, objEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape)      { escape = false; continue; }
    if (ch === "\\") { escape = true;  continue; }
    if (ch === '"')  { inString = !inString; continue; }
    if (inString)    continue;
    if (ch === "{")  { depth++; continue; }
    if (ch === "}") { depth--; if (depth === 0) { objEnd = i; break; } }
  }
  return objEnd !== -1
    ? s.slice(0, objEnd + 1)
    : s.slice(0, s.lastIndexOf("}") + 1) || s;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class GeminiProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super(config, GEMINI_BASE_URL);
  }

  async complete(
    modelId: string,
    request: AIRequest,
  ): Promise<Omit<AIResponse, "attemptCount" | "latencyMs">> {

    const url = `${this.baseUrl}/${modelId}:generateContent?key=${this.apiKey}`;

    // Separate system message from user messages
    const systemMsg = request.messages.find((m) => m.role === "system");
    const userMsgs  = request.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      contents: userMsgs.map((m) => ({
        role:  m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature:     request.temperature ?? 0.1,
        topP:            0.8,
        maxOutputTokens: request.maxTokens ?? 2048,
        responseMimeType: "application/json",
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    };

    if (systemMsg) {
      body.system_instruction = { parts: [{ text: systemMsg.content }] };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    } catch (networkErr) {
      throw makeProviderError(
        `Network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
        "TIMEOUT",
      );
    }

    const data = (await response.json()) as GeminiResponse;

    const quotaRemaining = parseGeminiQuotaHeaders(response.headers);
    if (quotaRemaining !== undefined) {
      apiLogger.setQuotaCache("gemini", quotaRemaining);
    }

    // ── Error response ──────────────────────────────────────────────────────
    if (!response.ok) {
      const msg = data.error?.message ?? `HTTP ${response.status}`;
      // Treat RESOURCE_EXHAUSTED as a rate limit so AIManager retries next model
      const category = isQuotaMessage(msg) ? "RATE_LIMIT" : categoryFromStatus(response.status);
      throw makeProviderError(msg, category, response.status, {
        quotaRemaining: quotaRemaining ?? 0,
      });
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw makeProviderError("Gemini returned no candidates.", "SERVER_ERROR");
    }

    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      // SAFETY / RECITATION — treat as non-retryable server error
      throw makeProviderError(
        `Gemini finishReason: ${candidate.finishReason}`,
        "SERVER_ERROR",
      );
    }

    const text = candidate.content?.parts?.[0]?.text ?? "";
    if (!text) {
      throw makeProviderError("Gemini returned empty text.", "SERVER_ERROR");
    }

    // ── Usage ───────────────────────────────────────────────────────────────
    const usage = data.usageMetadata
      ? {
          promptTokens:     data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens:      data.usageMetadata.totalTokenCount,
        }
      : undefined;

    return {
      content:      stripFences(text),
      modelUsed:    modelId,
      providerUsed: this.id,
      usage,
      quotaRemaining,
    };
  }
}
