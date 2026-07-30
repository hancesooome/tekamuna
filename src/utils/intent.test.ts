import { describe, expect, it } from "vitest";
import { shouldRunVerificationPipeline } from "./intent";

describe("shouldRunVerificationPipeline - Language-Agnostic Verifiability Classifier", () => {
  describe("MUST return TRUE (Fact-Check Pipeline)", () => {
    it("classifies Tagalog vaccine claim: Libre ang COVID vaccine sa lahat ng Pilipino.", () => {
      const result = shouldRunVerificationPipeline("Libre ang COVID vaccine sa lahat ng Pilipino.");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Tagalog metric ranking claim: Ang Pilipinas ay may pinakamataas na unemployment rate sa ASEAN.", () => {
      const result = shouldRunVerificationPipeline(
        "Ang Pilipinas ay may pinakamataas na unemployment rate sa ASEAN.",
      );
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Tagalog law/ban claim: Ipinagbawal na ang social media para sa mga menor de edad.", () => {
      const result = shouldRunVerificationPipeline(
        "Ipinagbawal na ang social media para sa mga menor de edad.",
      );
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Tagalog environmental claim: Ang Maynila ay ang pinaka-polluted na lungsod sa buong mundo.", () => {
      const result = shouldRunVerificationPipeline(
        "Ang Maynila ay ang pinaka-polluted na lungsod sa buong mundo.",
      );
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Tagalog event occurrence claim: May lindol na magnitude 7 sa Mindanao kahapon.", () => {
      const result = shouldRunVerificationPipeline(
        "May lindol na magnitude 7 sa Mindanao kahapon.",
      );
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Tagalog sports achievement claim: Nanalo si Carlos Yulo ng dalawang Olympic gold medals.", () => {
      const result = shouldRunVerificationPipeline(
        "Nanalo si Carlos Yulo ng dalawang Olympic gold medals.",
      );
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Tagalog economic trend claim: Bumaba ang inflation ngayong taon.", () => {
      const result = shouldRunVerificationPipeline("Bumaba ang inflation ngayong taon.");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("detects explicit English verification queries", () => {
      const result = shouldRunVerificationPipeline("Is this news accurate?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("detects sports and transfer rumors as verification-worthy", () => {
      const result = shouldRunVerificationPipeline("Is LeBron James going to Sixers?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("detects Filipino explicit fact-check phrases", () => {
      const result = shouldRunVerificationPipeline("Totoo ba na pinalaya siya?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("detects fake news queries", () => {
      const result = shouldRunVerificationPipeline("Fake news ba ito?");
      expect(result.shouldVerify).toBe(true);
    });

    it("recognizes English standalone news claims", () => {
      const result = shouldRunVerificationPipeline("Marcos Jr. declared Martial Law again.");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Filipino verifiable death question: patay naba si president bong bong marcos?", () => {
      const result = shouldRunVerificationPipeline("patay naba si president bong bong marcos?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies buhay pa ba question as verifiable", () => {
      const result = shouldRunVerificationPipeline("Buhay pa ba si Cory Aquino?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies English 'is X dead' as verifiable", () => {
      const result = shouldRunVerificationPipeline("Is Fidel Ramos still alive?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies namatay na ba question as verifiable", () => {
      const result = shouldRunVerificationPipeline("Namatay na ba si Erap Estrada?");
      expect(result.shouldVerify).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("MUST return FALSE (Normal Chat)", () => {
    it("routes Tagalog definitional query: Ano ang unemployment?", () => {
      const result = shouldRunVerificationPipeline("Ano ang unemployment?");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Definitional");
    });

    it("routes Tagalog definitional query: Ano ang ASEAN?", () => {
      const result = shouldRunVerificationPipeline("Ano ang ASEAN?");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Definitional");
    });

    it("routes Tagalog creative prompt: Gumawa ng tula tungkol sa Maynila.", () => {
      const result = shouldRunVerificationPipeline("Gumawa ng tula tungkol sa Maynila.");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Creative");
    });

    it("routes Tagalog translation task: Isalin ito sa English.", () => {
      const result = shouldRunVerificationPipeline("Isalin ito sa English.");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Creative");
    });

    it("routes Tagalog creative task: Sumulat ng birthday greeting.", () => {
      const result = shouldRunVerificationPipeline("Sumulat ng birthday greeting.");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Creative");
    });

    it("routes English creative request: Tell me a joke.", () => {
      const result = shouldRunVerificationPipeline("Tell me a joke.");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Creative");
    });

    it("blocks general knowledge questions: Who is the president?", () => {
      const result = shouldRunVerificationPipeline("Who is the president?");
      expect(result.shouldVerify).toBe(false);
    });

    it("blocks creative email requests", () => {
      const result = shouldRunVerificationPipeline("Write me an email about my vacation.");
      expect(result.shouldVerify).toBe(false);
    });

    it("blocks English translation requests", () => {
      const result = shouldRunVerificationPipeline("Translate this paragraph.");
      expect(result.shouldVerify).toBe(false);
    });

    it("blocks religious/philosophical verification questions", () => {
      const result = shouldRunVerificationPipeline("Is totoo ba ang diyos?");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("religious");
    });

    it("blocks English concept questions: What is inflation?", () => {
      const result = shouldRunVerificationPipeline("What is inflation?");
      expect(result.shouldVerify).toBe(false);
      expect(result.reason).toContain("Definitional");
    });
  });
});
