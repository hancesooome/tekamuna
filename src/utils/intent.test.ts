import { describe, expect, it } from "vitest";
import { shouldRunVerificationPipeline } from "./intent";

describe("shouldRunVerificationPipeline", () => {
  it("detects explicit verification requests", () => {
    const result = shouldRunVerificationPipeline("Is this news accurate?");
    expect(result.shouldVerify).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects sports and transfer rumors as verification-worthy", () => {
    const result = shouldRunVerificationPipeline("Is LeBron James going to Sixers?");
    expect(result.shouldVerify).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects Filipino fact-check phrases", () => {
    const result = shouldRunVerificationPipeline("Totoo ba na pinalaya siya?");
    expect(result.shouldVerify).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("detects requests about fake news and misinformation", () => {
    const result = shouldRunVerificationPipeline("Fake news ba ito?");
    expect(result.shouldVerify).toBe(true);
  });

  it("blocks general knowledge questions", () => {
    const result = shouldRunVerificationPipeline("Who is the president?");
    expect(result.shouldVerify).toBe(false);
  });

  it("blocks creative requests", () => {
    const result = shouldRunVerificationPipeline("Write me an email about my vacation.");
    expect(result.shouldVerify).toBe(false);
  });

  it("blocks translation requests", () => {
    const result = shouldRunVerificationPipeline("Translate this paragraph.");
    expect(result.shouldVerify).toBe(false);
  });

  it("blocks religious/philosophical verification questions", () => {
    const result = shouldRunVerificationPipeline("Is totoo ba ang diyos?");
    expect(result.shouldVerify).toBe(false);
    expect(result.reason).toContain("religious or philosophical");
  });

  it("returns a friendly reason on non-verification input", () => {
    const result = shouldRunVerificationPipeline("What is inflation?");
    expect(result.shouldVerify).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("recognizes standalone factual claims", () => {
    const result = shouldRunVerificationPipeline("Marcos Jr. declared Martial Law again.");
    expect(result.shouldVerify).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
  });
});
