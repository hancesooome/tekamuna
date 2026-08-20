/**
 * src/components/result/confidenceMetrics.ts
 *
 * Purpose:
 *   Shared, pure helpers for the "Detection Confidence" panel that is rendered
 *   identically on ResultPage and CheckPage.
 *
 *   Previously the derived mini-bar math (factualAccuracy / sourceAlignment /
 *   dataRecency) and the explanatory copy were copy-pasted verbatim in both
 *   pages. Centralising them here guarantees the two pages never drift apart.
 *
 * "Pure" means: no side effects, same input → same output, trivially testable.
 */

/** One labelled mini-bar in the confidence panel. */
export interface ConfidenceMetric {
  label: string;
  /** 0–100 percentage width for the bar. */
  value: number;
}

/**
 * Derives the three approximate confidence mini-bars from the raw AI
 * detection confidence. These are intentionally heuristic — they visualise
 * the single confidence number across three dimensions for the user.
 *
 * @param confidence  Raw detection confidence (0–100) from VerifyResult.
 * @returns           Ordered array of { label, value } mini-bars.
 */
export function deriveConfidenceMetrics(confidence: number): ConfidenceMetric[] {
  return [
    { label: "Factual accuracy", value: Math.round(confidence * 0.18) },
    { label: "Source alignment", value: Math.round(confidence * 0.27) },
    { label: "Data recency",     value: Math.min(95, Math.round(confidence * 0.95)) },
  ];
}

/**
 * The explanatory copy shown beneath the donut. Kept here (rather than inline)
 * so both pages render byte-identical text.
 */
export const DETECTION_CONFIDENCE_LABEL = "Detection Confidence";
