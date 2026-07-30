import { describe, expect, it } from "vitest";

// Punctuation and emoji normalization logic
export function normalizeClaim(claim: string): string {
  return claim
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove all characters except letters, numbers, and whitespace
    .replace(/\s+/g, " ")             // Collapse multiple spaces
    .trim();                          // Trim leading/trailing whitespace
}

describe("normalizeClaim - Fact-Check Claim Normalization", () => {
  it("converts letters to lowercase", () => {
    expect(normalizeClaim("BAGONG BALITA SA PILIPINAS")).toBe("bagong balita sa pilipinas");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeClaim("   pres marcos builds new schools   ")).toBe("pres marcos builds new schools");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeClaim("gold   medalist   yulo")).toBe("gold medalist yulo");
  });

  it("removes punctuation", () => {
    expect(normalizeClaim("Marcos: 'Ang Pilipinas, nanalo?' Oo! Yulo, nag-gold.")).toBe(
      "marcos ang pilipinas nanalo oo yulo naggold"
    );
  });

  it("removes emojis", () => {
    expect(normalizeClaim("Bumaba ang inflation ngayong taon! 🇵🇭📈😊")).toBe(
      "bumaba ang inflation ngayong taon"
    );
  });

  it("handles empty or single-character inputs gracefully", () => {
    expect(normalizeClaim("")).toBe("");
    expect(normalizeClaim("   ")).toBe("");
    expect(normalizeClaim("!@#$%")).toBe("");
  });
});
