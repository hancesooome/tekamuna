import { describe, expect, it } from "vitest";
import { parseVerdictContent } from "./gemini";

const suppliedSources = [{
  title: "Official report",
  url: "https://example.com/report?utm_source=test",
  content: "Original search excerpt",
  score: 0.9,
  publishedDate: "2026-08-21",
}];

describe("parseVerdictContent", () => {
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
