/**
 * src/services/api.ts
 *
 * Purpose:
 *   Centralised HTTP client for all Teka Muna API calls.
 *   All communication with the Cloudflare Worker lives here — no fetch()
 *   calls anywhere else in the frontend.
 *
 * Responsibilities:
 *   - verifyClaim()   — POST /api/verify
 *   - analyzeImage()  — POST /api/analyze-image (multipart)
 *
 * Architecture decision:
 *   Every function returns the domain type directly and throws an
 *   ApiServiceError on failure. TanStack Query (useVerify) catches and
 *   surfaces the error; components stay clean of fetch logic.
 *
 * Dependencies:
 *   - src/constants/index.ts  (API_BASE_URL)
 *   - src/types/verify.ts     (VerifyRequest, VerifyResult, ImageAnalysisResult)
 *
 * When to modify:
 *   - Adding a new API endpoint
 *   - Adding request headers (e.g. auth tokens)
 *   - Changing error handling behaviour
 */

import type { VerifyRequest, VerifyResult, ImageAnalysisResult } from "@/types";
import { isApiError } from "@/types";
import { API_BASE_URL } from "@/constants";

// ── Base URL ──────────────────────────────────────────────────────────────────
// In dev, Vite proxies /api → localhost:8787 (wrangler dev).
// In production the Worker is bound to the same Pages domain under /api/*.
const BASE_URL = API_BASE_URL;

// ── Custom error ──────────────────────────────────────────────────────────────
export class ApiServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiServiceError";
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────
async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const message = isApiError(data) ? data.error : `HTTP ${response.status}`;
    throw new ApiServiceError(message, response.status);
  }

  return data as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Submit a claim for verification.
 *
 * @throws {ApiServiceError} on network failure or non-2xx response
 */
export async function verifyClaim(payload: VerifyRequest): Promise<VerifyResult> {
  return post<VerifyResult>("/verify", payload);
}

/**
 * Analyse an image and extract the factual claim it contains.
 * Uses multipart/form-data — image file sent as "image" field.
 *
 * Returns ImageAnalysisResult with success=true/false.
 * Never throws for AI failures — check result.success instead.
 *
 * @throws {ApiServiceError} only on network/HTTP errors (not AI failures)
 */
export async function analyzeImage(file: File): Promise<ImageAnalysisResult> {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`${BASE_URL}/analyze-image`, {
    method: "POST",
    body:   formData,
    // Do NOT set Content-Type — browser sets it with boundary automatically
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const message = isApiError(data) ? data.error : `HTTP ${response.status}`;
    throw new ApiServiceError(message, response.status);
  }

  return data as ImageAnalysisResult;
}
