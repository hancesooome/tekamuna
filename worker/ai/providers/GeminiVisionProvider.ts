/**
 * GeminiVisionProvider
 *
 * Uses Gemini's multimodal generateContent API directly.
 * gemini-2.0-flash supports inline base64 image data natively.
 *
 * Used as fallback when OpenRouter vision models are unavailable.
 */

import type { VisionProvider, VisionRequest, VisionResponse } from "./VisionProvider";
import { VisionProviderError } from "./VisionProvider";

const GEMINI_VISION_MODEL = "gemini-2.0-flash";
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content: { parts: Array<{ text: string }> };
    finishReason?: string;
  }>;
  error?: { message: string; code: number };
}

export class GeminiVisionProvider implements VisionProvider {
  readonly id = "gemini-vision";

  constructor(private readonly apiKey: string) {}

  async analyse(request: VisionRequest): Promise<VisionResponse> {
    const url =
      `${GEMINI_BASE_URL}/${GEMINI_VISION_MODEL}:generateContent?key=${this.apiKey}`;

    const startMs = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: request.mimeType,
                    data:     request.imageBase64,
                  },
                },
                { text: request.prompt },
              ],
            },
          ],
          generationConfig: {
            temperature:     0.1,
            maxOutputTokens: request.maxTokens ?? 500,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      });
    } catch (networkErr) {
      throw new VisionProviderError(
        `Gemini network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
        true,
      );
    }

    const data = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      const msg = data.error?.message ?? `HTTP ${response.status}`;
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        msg.toLowerCase().includes("quota");
      throw new VisionProviderError(msg, retryable, response.status);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      throw new VisionProviderError("Gemini vision returned empty text.", false);
    }

    return {
      content:   text,
      modelUsed: GEMINI_VISION_MODEL,
      latencyMs: Date.now() - startMs,
    };
  }
}
