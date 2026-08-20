/**
 * src/components/result/index.ts
 *
 * Barrel export for the shared result UI components used by both ResultPage
 * and CheckPage. Import from "@/components/result" rather than reaching into
 * individual files.
 */

export { ClaimBanner } from "./ClaimBanner";
export { ConfidencePanel } from "./ConfidencePanel";
export { EvidenceTimeline } from "./EvidenceTimeline";
export { SourceList } from "./SourceList";
export { VerdictCard } from "./VerdictCard";
export { VerdictTabs } from "./VerdictTabs";
export { VerdictLoadingView, useLoadingStep, LOADING_STEPS } from "./VerdictLoadingView";
export { deriveConfidenceMetrics, DETECTION_CONFIDENCE_LABEL } from "./confidenceMetrics";
export type { ConfidenceMetric } from "./confidenceMetrics";
