import { describe, expect, it } from "vitest";
import { isFactCheckingQuery } from "./intent";

describe("isFactCheckingQuery", () => {
  it("detects explicit fact-check requests", () => {
    const result = isFactCheckingQuery("Is this news accurate?");
    expect(result.isFactCheck).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects sports and transfer rumors as fact-check queries", () => {
    const result = isFactCheckingQuery("Is LeBron James going to Sixers?");
    expect(result.isFactCheck).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects Filipino fact-check phrases", () => {
    const result = isFactCheckingQuery("Totoo ba na pinalaya siya?");
    expect(result.isFactCheck).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("detects requests about fake news and misinformation", () => {
    const result = isFactCheckingQuery("Fake news ba ito?");
    expect(result.isFactCheck).toBe(true);
  });

  it("blocks general knowledge questions", () => {
    const result = isFactCheckingQuery("Who is the president?");
    expect(result.isFactCheck).toBe(false);
  });

  it("blocks creative requests", () => {
    const result = isFactCheckingQuery("Write me an email about my vacation.");
    expect(result.isFactCheck).toBe(false);
  });

  it("blocks translation requests", () => {
    const result = isFactCheckingQuery("Translate this paragraph.");
    expect(result.isFactCheck).toBe(false);
  });

  it("blocks religious/philosophical verification questions", () => {
    const result = isFactCheckingQuery("Is totoo ba ang diyos?");
    expect(result.isFactCheck).toBe(false);
    expect(result.reason).toContain("religious or philosophical");
  });

  it("returns a friendly reason on non-fact-check input", () => {
    const result = isFactCheckingQuery("What is inflation?");
    expect(result.isFactCheck).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
