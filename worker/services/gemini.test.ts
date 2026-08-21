import { describe, expect, it } from "vitest";
import { parseVerdictContent } from "./gemini";

const allowedUrls = new Set(["https://example.com/report"]);

describe("parseVerdictContent", () => {
  it("accepts a complete verdict using only supplied source URLs", () => {
    const result = parseVerdictContent(JSON.stringify({
      verdict: "true",
      confidence: 82,
      explanation: "Sinusuportahan ng mga ulat ang claim.",
      truthStatement: "May sapat na ebidensiya.",
      supportingEvidence: [{ url: "https://example.com/report" }],
      contradictingEvidence: [],
    }), allowedUrls);

    expect(result.verdict).toBe("true");
  });

  it("rejects incomplete JSON recovered as only partial fields", () => {
    expect(() => parseVerdictContent(
      '{"verdict":"true","confidence":80}',
      allowedUrls,
    )).toThrow("no explanation");
  });

  it("rejects evidence URLs that were not supplied by search", () => {
    expect(() => parseVerdictContent(JSON.stringify({
      verdict: "false",
      confidence: 70,
      explanation: "Hindi ito sinusuportahan ng source.",
      truthStatement: "Salungat ang ebidensiya.",
      supportingEvidence: [],
      contradictingEvidence: [{ url: "https://invented.example/story" }],
    }), allowedUrls)).toThrow("unknown URL");
  });
});
