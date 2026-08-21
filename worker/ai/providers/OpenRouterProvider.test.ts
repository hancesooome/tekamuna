import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "./OpenRouterProvider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouterProvider", () => {
  it("rejects a response stopped by the token limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "poolside/laguna-xs-2.1:free",
      choices: [{
        message: { role: "assistant", content: '{"verdict":"true"' },
        finish_reason: "length",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const provider = new OpenRouterProvider({ id: "openrouter", apiKey: "test-key" });
    await expect(provider.complete("openrouter/free", {
      task: "VERDICT",
      messages: [{ role: "user", content: "test" }],
      maxTokens: 1800,
      jsonMode: true,
    })).rejects.toMatchObject({ category: "PARSE_ERROR", retryable: true });
  });

  it("requests JSON mode and reports the actual routed model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "google/gemma-4-26b-a4b-it:free",
      choices: [{
        message: { role: "assistant", content: '{"verdict":"true"}' },
        finish_reason: "stop",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider({ id: "openrouter", apiKey: "test-key" });
    const result = await provider.complete("openrouter/free", {
      task: "VERDICT",
      messages: [{ role: "user", content: "test" }],
      jsonMode: true,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(result.modelUsed).toBe("google/gemma-4-26b-a4b-it:free");
    expect(result.finishReason).toBe("stop");
  });
});
