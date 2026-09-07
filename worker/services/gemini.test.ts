import { afterEach, describe, expect, it, vi } from "vitest";
import { analyseEvidence, parseVerdictContent } from "./gemini";
import { AIManager } from "../ai/AIManager";

afterEach(() => { vi.restoreAllMocks(); });

const validVerdict = {
  verdict: "true",
  confidence: 90,
  explanation: "Sinusuportahan ng ulat ang claim.",
  truthStatement: "May ebidensiya sa ibinigay na ulat.",
  supportingEvidence: [{ sourceIndex: 1, summary: "Sinusuportahan ng ulat." }],
  contradictingEvidence: [],
};

const suppliedSources = [{
  title: "Official report",
  url: "https://example.com/report?utm_source=test",
  content: "Original search excerpt",
  score: 0.9,
  publishedDate: "2026-08-21",
}];

describe("parseVerdictContent", () => {
  it.each(["true", "false", "misleading"])("rejects an uncited %s verdict", (verdict) => {
    expect(() => parseVerdictContent(JSON.stringify({
      ...validVerdict, verdict, supportingEvidence: [], contradictingEvidence: [],
    }), suppliedSources)).toThrow("evidence");
  });

  it.each([null, true, "90"])("rejects nonnumeric confidence %s", (confidence) => {
    expect(() => parseVerdictContent(JSON.stringify({ ...validVerdict, confidence }), suppliedSources)).toThrow("confidence");
  });

  it("rejects duplicate citations and missing summaries", () => {
    expect(() => parseVerdictContent(JSON.stringify({
      ...validVerdict, supportingEvidence: [validVerdict.supportingEvidence[0], validVerdict.supportingEvidence[0]],
    }), suppliedSources)).toThrow("duplicated");
    expect(() => parseVerdictContent(JSON.stringify({
      ...validVerdict, supportingEvidence: [{ sourceIndex: 1 }],
    }), suppliedSources)).toThrow("summary");
  });

  it("allows insufficient evidence without citations and ignores invented search counts", () => {
    const result = parseVerdictContent(JSON.stringify({
      ...validVerdict, verdict: "unverified", supportingEvidence: [], searchResultsCount: 100,
    }), suppliedSources);
    expect(result.verdict).toBe("unverified");
    expect(result.searchResultsCount).toBe(1);
  });
  it("maps a source index back to the exact supplied source URL", () => {
    const result = parseVerdictContent(JSON.stringify({
      verdict: "true",
      confidence: 82,
      explanation: "Sinusuportahan ng mga ulat ang claim.",
      truthStatement: "May sapat na ebidensiya.",
      supportingEvidence: [{ sourceIndex: 1, summary: "Sinusuportahan ng ulat." }],
      contradictingEvidence: [],
    }), suppliedSources);

    expect(result.verdict).toBe("true");
    expect(result.supportingEvidence?.[0].url).toBe(suppliedSources[0].url);
  });

  it("rejects incomplete JSON recovered as only partial fields", () => {
    expect(() => parseVerdictContent(
      '{"verdict":"true","confidence":80}',
      suppliedSources,
    )).toThrow("no explanation");
  });

  it("rejects source indexes outside the supplied search results", () => {
    expect(() => parseVerdictContent(JSON.stringify({
      verdict: "false",
      confidence: 70,
      explanation: "Hindi ito sinusuportahan ng source.",
      truthStatement: "Salungat ang ebidensiya.",
      supportingEvidence: [],
      contradictingEvidence: [{ sourceIndex: 2, summary: "Hindi tugma." }],
    }), suppliedSources)).toThrow("invalid sourceIndex");
  });
});

describe("analyseEvidence", () => {
  it("returns unverified without calling AI when search returned no evidence", async () => {
    const complete = vi.spyOn(AIManager.prototype, "complete");
    const result = await analyseEvidence({ claim: "May bagong batas daw.", searchResults: [] });
    expect(complete).not.toHaveBeenCalled();
    expect(result.verdict).toBe("unverified");
    expect(result.confidence).toBe(0);
    expect(result._persist).toBe(false);
  });

  it("preserves evidence beyond 150 characters and caps confidence by cited publishers", async () => {
    const complete = vi.spyOn(AIManager.prototype, "complete").mockResolvedValue({
      content: JSON.stringify(validVerdict), modelUsed: "test", providerUsed: "openrouter",
      attemptCount: 1, latencyMs: 1,
    });
    const sources = Array.from({ length: 10 }, (_, index) => ({
      ...suppliedSources[0], url: `https://example.com/report-${index}`,
      content: `${"Background. ".repeat(20)}Hindi pa aprubado ang panukala.`,
    }));
    const result = await analyseEvidence({ claim: "Aprubado na raw ang panukala.", searchResults: sources });
    const request = complete.mock.calls[0][0];
    expect(request.messages[1].content).toContain("Hindi pa aprubado ang panukala.");
    expect(result.confidence).toBe(70);
    expect(result.searchResultsCount).toBe(10);
    expect(result.supportingEvidence[0].url).toBe(sources[0].url);
  });
});
