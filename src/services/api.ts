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
// TypeScript-only imports — these types define the shape of our request/response data.

import { isApiError } from "@/types";
// isApiError is a "type guard" — a function that checks if an unknown value
// has the shape of our ApiError ({ error: string }).
// We use it to safely extract error messages from unknown API responses.

import { API_BASE_URL } from "@/constants";
// API_BASE_URL → the base URL for all API calls (e.g. "" in dev so Vite proxies /api → Worker)

// ── Base URL ──────────────────────────────────────────────────────────────────
// In dev, Vite proxies /api → localhost:8787 (wrangler dev).
// In production the Worker is bound to the same Pages domain under /api/*.
const BASE_URL = API_BASE_URL;

// ── Custom error ──────────────────────────────────────────────────────────────
// We extend the built-in Error class to add an optional HTTP `status` code.
// This lets callers distinguish "network down" (no status) from "400 Bad Request" etc.
export class ApiServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number, // e.g. 400, 422, 503
  ) {
    super(message);             // calls Error constructor with the message
    this.name = "ApiServiceError"; // overrides "Error" in stack traces for clarity
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────
// post<T> is a generic function:
//   endpoint → URL path suffix (e.g. "/verify")
//   body     → any JS value that will be JSON-serialised as the request body
//   returns  → Promise<T> — T is whatever type we expect back from the server
async function post<T>(endpoint: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  // fetch() sends an HTTP request. We construct the full URL from BASE_URL + endpoint.
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", // tells the server we're sending JSON
      ...extraHeaders,
    },
    body: JSON.stringify(body), // convert the JS object to a JSON string
  });

  // response.json() parses the response body as JSON.
  // We type it as `unknown` because we don't trust the server yet.
  const data: unknown = await response.json();

  // response.ok is true for 200–299 status codes.
  // Anything else (400, 422, 503 etc.) is an error.
  if (!response.ok) {
    // isApiError checks if `data` has an "error" string field.
    // If yes, use that message; otherwise fall back to "HTTP 422" etc.
    const message = isApiError(data) ? data.error : `HTTP ${response.status}`;
    throw new ApiServiceError(message, response.status);
  }

  // We cast to T here because we trust the server returned the correct shape.
  // TypeScript can't verify this at runtime — it's our responsibility to keep
  // the types in sync with the Worker's actual response.
  return data as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Submit a claim for verification.
 *
 * @throws {ApiServiceError} on network failure or non-2xx response
 */
export async function verifyClaim(payload: VerifyRequest): Promise<VerifyResult> {
  // Read the Tavily key preference stored by TavilyKeySwitcher and forward it
  // as a request header. Cloudflare Workers are stateless — the POST to
  // /api/stats/tavily-config sets preference in a different worker isolate than
  // the one handling /api/verify, so we must re-send it on every verify call.
  const tavilyPref =
    (localStorage.getItem("teka_tavily_preferred_key") as "auto" | "key1" | "key2" | null) ?? "auto";

  return post<VerifyResult>("/verify", payload, {
    "x-tavily-preference": tavilyPref,
  });
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
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const message = isApiError(data) ? data.error : `HTTP ${response.status}`;
    throw new ApiServiceError(message, response.status);
  }

  return data as ImageAnalysisResult;
}
