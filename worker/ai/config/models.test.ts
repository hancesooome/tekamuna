import { describe, expect, it } from "vitest";
import { getModelsForTask } from "./models";

describe("default AI model configuration", () => {
  it("uses explicit free models for verdicts", () => {
    const models = getModelsForTask("VERDICT");
    expect(models.map((model) => model.modelId)).toEqual([
      "minimax/minimax-m3:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "google/gemma-4-31b-it:free",
    ]);
    expect(models.every((model) => model.free)).toBe(true);
    expect(models.some((model) => model.modelId === "openrouter/free")).toBe(false);
  });

  it("ignores the retired GPT-OSS free slug in old environment overrides", () => {
    const models = getModelsForTask("VERDICT", {
      MODELS_VERDICT: "openai/gpt-oss-120b:free",
    });
    expect(models[0].modelId).toBe("minimax/minimax-m3:free");
    expect(models.some((model) => model.modelId === "openai/gpt-oss-120b:free")).toBe(false);
  });
});
