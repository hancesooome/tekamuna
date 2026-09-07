import { afterEach, describe, expect, it, vi } from "vitest";
import { AIManager } from "./AIManager";

afterEach(() => { vi.unstubAllGlobals(); });

describe("AIManager fallback", () => {
  it("tries key 2 when key 1 reports that a free model is unavailable", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const authorization = new Headers(init.headers).get("Authorization");
      if (authorization === "Bearer key-1") {
        return Promise.resolve(new Response(JSON.stringify({
          error: {
            message: "This model is unavailable for free. The paid version is available now - use this slug instead: openai/gpt-oss-120b",
          },
        }), { status: 400, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        model: "minimax/minimax-m3:free",
        choices: [{ message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const manager = new AIManager({
      openrouter: { id: "openrouter", apiKey: "key-1" },
      openrouter2: { id: "openrouter2", apiKey: "key-2" },
    }, { MODELS_VERDICT: "minimax/minimax-m3:free" });

    const result = await manager.complete({
      task: "VERDICT",
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.providerUsed).toBe("openrouter2");
    expect(result.attemptCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
