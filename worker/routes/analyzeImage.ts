/**
 * POST /api/analyze-image
 *
 * Accepts a multipart form upload with a single image file.
 * Returns an ImageAnalysisResult with the extracted claim.
 *
 * Request:  multipart/form-data  { image: File }
 * Response: ImageAnalysisResult
 *
 * Validation:
 *   - Supported formats: JPG, PNG, WebP
 *   - Max size: 10 MB
 *   - Single file only
 */

import type { Env } from "../index";
import { analyseImage } from "../services/ImageAnalyser";
import type { ImageAnalysisResult } from "../../src/types/verify";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleAnalyzeImage(
  request: Request,
  env: Env,
): Promise<Response> {
  // ── 1. Parse multipart form ──────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid form data.", code: "NO_IMAGE" }, 400);
  }

  const imageFile = formData.get("image") as unknown as File | null;

  if (!imageFile) {
    return json({ error: "No image file provided.", code: "NO_IMAGE" }, 422);
  }

  // ── 2. Validate format ───────────────────────────────────────────────────
  const mimeType = imageFile.type.toLowerCase();

  if (!ALLOWED_TYPES.has(mimeType)) {
    return json(
      {
        error: `Unsupported format "${imageFile.type}". Please upload JPG, PNG, or WebP.`,
        code:  "UNSUPPORTED_FORMAT",
      },
      422,
    );
  }

  // ── 3. Validate size ─────────────────────────────────────────────────────
  if (imageFile.size > MAX_BYTES) {
    const mb = (imageFile.size / (1024 * 1024)).toFixed(1);
    return json(
      {
        error: `File too large (${mb} MB). Maximum allowed is 10 MB.`,
        code:  "FILE_TOO_LARGE",
      },
      422,
    );
  }

  // ── 4. Read image bytes ──────────────────────────────────────────────────
  let imageData: Uint8Array;
  try {
    imageData = new Uint8Array(await imageFile.arrayBuffer());
  } catch {
    return json({ error: "Could not read image file.", code: "NO_IMAGE" }, 500);
  }

  // ── 5. Analyse with AI vision ────────────────────────────────────────────
  const normalised = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  const result = await analyseImage({
    imageData,
    mimeType:       normalised as "image/jpeg" | "image/png" | "image/webp",
    openRouterKey:  env.OPENROUTER_API_KEY,
    openRouterKey2: env.OPENROUTER_API_KEY_2,
    geminiKey:      env.GEMINI_API_KEY,
  });

  // ── 6. Return ────────────────────────────────────────────────────────────
  // Always 200 — the frontend checks result.success
  return json(result satisfies ImageAnalysisResult, 200);
}
