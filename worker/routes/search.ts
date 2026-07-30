/**
 * GET /api/search?q=<claim>
 *
 * Returns raw Tavily search results for a given query.
 * Useful for:
 *   - Testing the Tavily integration in isolation
 *   - Inspecting what evidence the AI will receive before analysis
 *   - Future: a "sources" preview panel in the UI
 *
 * Response shape: SearchResponse (see src/types/verify.ts)
 */

import type { Env } from "../index";
import { searchWeb } from "../services/tavily";
import type { SearchResponse } from "../../src/types/verify";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query || query.length < 3) {
    return json(
      { error: "Query param `q` is required and must be at least 3 characters." },
      422,
    );
  }

  if (query.length > 500) {
    return json({ error: "Query param `q` must not exceed 500 characters." }, 422);
  }

  const results = await searchWeb(
    query,
    env.TAVILY_API_KEY,
    env.TAVILY_API_KEY_2,
  );

  const payload: SearchResponse = {
    query,
    results,
    totalResults: results.length,
    searchedAt: new Date().toISOString(),
  };

  return json(payload, 200);
}
