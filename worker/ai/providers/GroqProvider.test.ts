import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "./GroqProvider";

afterEach(() => { vi.unstubAllGlobals(); });

describe("GroqProvider", () => {
  it("strips the routing prefix, requests JSON, and caps free-tier output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "openai/gpt-oss-120b",
      choices: [{ message: { content: '{"verdict":"true"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600 },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-ratelimit-remaining-requests": "999",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GroqProvider({ id: "groq", apiKey: "gsk_test" });
    const result = await provider.complete("groq/openai/gpt-oss-120b", {
      task: "VERDICT",
      messages: [{ role: "user", content: "test" }],
      jsonMode: true,
      maxTokens: 4096,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.max_tokens).toBe(1200);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.include_reasoning).toBe(false);
    expect(result.providerUsed).toBe("groq");
    expect(result.quotaRemaining).toEqual({ label: "999 requests remaining" });
  });

  it("returns a retryable error when Groq is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Rate limit reached" },
    }), { status: 429, headers: { "Content-Type": "application/json" } })));

    const provider = new GroqProvider({ id: "groq", apiKey: "gsk_test" });
    await expect(provider.complete("groq/openai/gpt-oss-120b", {
      task: "VERDICT",
      messages: [{ role: "user", content: "test" }],
    })).rejects.toMatchObject({ category: "RATE_LIMIT", retryable: true });
  });
});
