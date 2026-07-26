/**
 * OpenRouterVisionProvider
 *
 * Routes image analysis requests to vision-capable models on OpenRouter.
 * Uses the OpenAI-compatible multimodal message format.
 *
 * Free vision models on OpenRouter (in priority order):
 *   - google/gemma-3-27b-it:free        — strong vision + text
 *   - meta-llama/llama-3.2-11b-vision-instruct:free
 *   - qwen/qwen2.5-vl-7b-instruct:free  — Qwen Vision-Language
 *
 * ── How to add a new vision model ────────────────────────────────────────────
 * Add model ID to VISION_MODELS array below.
 * Models must support the OpenAI image_url content block format.
 */

import type { VisionProvider, VisionRequest, VisionResponse } from "./VisionProvider";
import { VisionProviderError } from "./VisionProvider";

// ── Free vision-capable models in priority order ──────────────────────────────
const VISION_MODELS = [
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "qwen/qwen2.5-vl-7b-instruct:free",
];

// ── Wire types ────────────────────────────────────────────────────────────────

interface ORResponse {
  choices?: Array<{ message: { content: string }; finish_reason?: string }>;
  error?:   { message: string; code?: number | string };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OpenRouterVisionProvider implements VisionProvider {
  readonly id = "openrouter-vision";

  constructor(private readonly apiKey: string) {}

  async analyse(request: VisionRequest): Promise<VisionResponse> {
    let lastError: Error = new Error("No vision models available");

    for (const modelId of VISION_MODELS) {
      const startMs = Date.now();
      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${this.apiKey}`,
              "HTTP-Referer":  "https://teka-nga.pages.dev",
              "X-Title":       "Teka Muna Image Analysis",
            },
            body: JSON.stringify({
              model: modelId,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type:      "image_url",
                      image_url: {
                        url: `data:${request.mimeType};base64,${request.imageBase64}`,
                      },
                    },
                    { type: "text", text: request.prompt },
                  ],
                },
              ],
              max_tokens:  request.maxTokens ?? 500,
              temperature: 0.1,
            }),
          },
        );

        const data = (await response.json()) as ORResponse;

        if (!response.ok) {
          const msg = data.error?.message ?? `HTTP ${response.status}`;
          const retryable = response.status === 429 || response.status >= 500;
          lastError = new VisionProviderError(
            `${modelId}: ${msg}`, retryable, response.status,
          );
          continue; // try next model
        }

        const content = data.choices?.[0]?.message?.content ?? "";
        if (!content) {
          lastError = new VisionProviderError(`${modelId}: empty content`, true);
          continue;
        }

        return { content, modelUsed: modelId, latencyMs: Date.now() - startMs };

      } catch (networkErr) {
        lastError = new VisionProviderError(
          `${modelId}: network error — ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
          true,
        );
        continue;
      }
    }

    throw lastError;
  }
}
