/**
 * VisionProvider — abstract interface for AI Vision models.
 *
 * Separate from BaseProvider because vision APIs have a fundamentally
 * different input format (image bytes + prompt rather than text messages).
 *
 * ── How to add a new vision provider ─────────────────────────────────────────
 * 1. Create /worker/ai/providers/<Name>VisionProvider.ts
 * 2. Implement VisionProvider interface
 * 3. Register it in ImageAnalyser.ts
 *
 * Current implementations:
 *   - OpenRouterVisionProvider  — routes to vision-capable models on OpenRouter
 *   - GeminiVisionProvider      — uses Gemini's multimodal API directly
 *
 * Future:
 *   - OpenAIVisionProvider      — GPT-4o vision
 *   - QwenVisionProvider        — Qwen-VL
 */

// ── Request / Response ────────────────────────────────────────────────────────

export interface VisionRequest {
  /** Base64-encoded image data (without data URL prefix). */
  imageBase64: string;
  /** MIME type of the image. */
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Text prompt to send alongside the image. */
  prompt: string;
  /** Max tokens for the response. */
  maxTokens?: number;
}

export interface VisionResponse {
  /** Raw text response from the model. */
  content: string;
  /** Which model answered. */
  modelUsed: string;
  /** Wall-clock latency in ms. */
  latencyMs: number;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class VisionProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "VisionProviderError";
  }
}

// ── Abstract interface ────────────────────────────────────────────────────────

export interface VisionProvider {
  readonly id: string;
  /** Analyse an image and return a text response. */
  analyse(request: VisionRequest): Promise<VisionResponse>;
}
