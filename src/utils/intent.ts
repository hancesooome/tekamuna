/**
 * src/utils/intent.ts
 *
 * Language-agnostic intent classifier for determining whether a user prompt
 * should enter the Fact-Checking Pipeline or be routed to Normal AI Chat.
 *
 * Classification Rule:
 *   Ask: "Can this statement be objectively verified using reliable evidence?"
 *   - YES -> Fact-check pipeline (shouldVerify: true)
 *   - NO  -> Normal AI chat (shouldVerify: false)
 *
 * Supports English, Tagalog (Filipino), and Taglish inputs.
 */

export interface DetectionResult {
  shouldVerify: boolean;
  confidence: number;
  reason: string;
}

// ── Non-Verifiable Patterns (Normal Chat Triggers) ─────────────────────────

interface ClassificationPattern {
  regex: RegExp;
  reason: string;
}

const CREATIVE_OR_TASK_PATTERNS: ClassificationPattern[] = [
  {
    regex: /\b(gumawa|sumulat|ikwento|isalin|ipaliwanag|mag-generate|mag-design|mag-draw|tula|joke|birthday greeting|greeting|kwento)\b/i,
    reason: "Non-verifiable request: Creative text generation or task command.",
  },
  {
    regex: /\b(write|tell me a joke|tell me a story|compose|create|generate|draft|draw|paint|design|translate|summarize|summary|poem|story|email)\b/i,
    reason: "Non-verifiable request: Creative text generation or task command.",
  },
];

const DEFINITIONAL_PATTERNS: ClassificationPattern[] = [
  {
    regex: /^\s*ano\s+(ang|ibig\s+sabihin\s+ng)\b/i,
    reason: "Non-verifiable query: Definitional or general concept inquiry.",
  },
  {
    regex: /^\s*what\s+(is|are|does\s+.*mean)\b/i,
    reason: "Non-verifiable query: Definitional or general concept inquiry.",
  },
  {
    regex: /^\s*who\s+(is|are|was|were)\s+[^?]+[?]?$/i,
    reason: "Non-verifiable query: General knowledge or identification query.",
  },
  {
    regex: /^\s*paano\s+(mag|gumawa|pumunta|gamitin)\b/i,
    reason: "Non-verifiable query: Instructional or how-to query.",
  },
  {
    regex: /^\s*how\s+(to|do|can|does)\b/i,
    reason: "Non-verifiable query: Instructional or how-to query.",
  },
];

const SUBJECTIVE_OR_RELIGIOUS_PATTERNS: ClassificationPattern[] = [
  {
    regex: /\b(diyos|god|faith|belief|religion|spiritual|spirituality)\b/i,
    reason: "Non-verifiable statement: Philosophical or religious belief.",
  },
  {
    regex: /\b(best|better than|favorite|recommend|should i|which .* is better|opinion|mas maganda|mas mabuti)\b/i,
    reason: "Non-verifiable query: Subjective opinion, recommendation, or advice.",
  },
];

// ── Verifiable Patterns (Fact-Check Triggers) ───────────────────────────────

const EXPLICIT_VERIFICATION_PATTERNS: ClassificationPattern[] = [
  {
    regex: /\btotoo\s+ba\b/i,
    reason: "Explicit Filipino fact-check query.",
  },
  {
    regex: /\bfake\s*news\b/i,
    reason: "Contains misinformation/fake news query.",
  },
  {
    regex: /\b(fact\s*check|verify|debunk|hoax|misleading|misinformation|disinformation)\b/i,
    reason: "Explicit verification request.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would)\b.*\b(true|real|authentic|accurate|accurately|news|claim|information|misleading|hoax|fake)\b/i,
    reason: "Asks whether a statement or news is true/accurate.",
  },
  {
    regex: /\b(did .* really|did .* happen|is .* real|is .* authentic|is .* accurate|is .* true|is .* news accurate|is .* information|did .* say this)\b/i,
    reason: "Asks whether a specific claim, event, or statement is real.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would|will)\b.*\b(go(?:ing)? to|join(?:ing)?|transfer|sign(?:ing)?|move(?:s|d)? to|play for|sign for)\b/i,
    reason: "Asks whether a specific event or transfer rumor is true.",
  },
];

const FACTUAL_ASSERTION_PATTERNS: ClassificationPattern[] = [
  // Tagalog factual assertions
  {
    regex: /\b(libre\s+ang|may\s+pinaka|ipinagbawal|ipinagbawal\s+na|may\s+lindol|nanalo\s+si|bumaba\s+ang|tumaas\s+ang|pinalaya|naganap|idineklara|naratipikahan|nasunog|napatay|inireport|naging)\b/i,
    reason: "Contains a Filipino factual assertion (verifiable event, policy, status, or metric).",
  },
  {
    regex: /\b(pinakamataas|pinakamababa|pinaka-polluted|pinakamabilis|pinakamalaki|pinakamaliit)\b/i,
    reason: "Contains a superlative comparative factual claim.",
  },
  // English factual assertions
  {
    regex: /\b(declared|announced|arrested|died|passed away|shut down|shutting down|resigned|suspended|banned|closed|charged|indicted|launched|approved|signed|enacted|removed|fired|sued|caught|killed|acquired|merged|split|cancelled|canceled|leaked|revealed|confirmed|denied|released|detained|injured|attacked|exploded|crashed|contained|contains|contain|became|become|reported|won|lost|decreased|increased)\b/i,
    reason: "Contains an English factual assertion verb.",
  },
  {
    regex: /\b(unemployment|inflation|covid|vaccine|olympic|gold medals|martial law|asean|gdp|presidency|election|magnitude)\b/i,
    reason: "Contains a concrete verifiable subject/metric entity.",
  },
];

// ── Core Function ─────────────────────────────────────────────────────────────

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[“”„«»]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[^\w\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Log classification details for debugging and auditability.
 */
function logClassificationResult(input: string, result: DetectionResult): void {
  const statusLabel = result.shouldVerify ? "PIPELINE" : "NORMAL_CHAT";
  console.log(
    `[ClaimClassifier] Input: "${input}" | Result: ${statusLabel} | Confidence: ${result.confidence.toFixed(2)} | Reason: ${result.reason}`,
  );
}

/**
 * Determines whether a user statement should enter the Fact-Checking Pipeline.
 */
export function shouldRunVerificationPipeline(input: string): DetectionResult {
  const rawInput = input ? input.trim() : "";
  const normalized = normalizeInput(rawInput);

  if (normalized.length === 0) {
    const res: DetectionResult = {
      shouldVerify: false,
      confidence: 0,
      reason: "Empty input cannot be classified for verification.",
    };
    logClassificationResult(rawInput, res);
    return res;
  }

  // 1. Check Non-Verifiable Patterns (Highest Priority for Normal Chat Routing)
  for (const pattern of CREATIVE_OR_TASK_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      const res: DetectionResult = {
        shouldVerify: false,
        confidence: 0.95,
        reason: pattern.reason,
      };
      logClassificationResult(rawInput, res);
      return res;
    }
  }

  for (const pattern of DEFINITIONAL_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      const res: DetectionResult = {
        shouldVerify: false,
        confidence: 0.9,
        reason: pattern.reason,
      };
      logClassificationResult(rawInput, res);
      return res;
    }
  }

  for (const pattern of SUBJECTIVE_OR_RELIGIOUS_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      const res: DetectionResult = {
        shouldVerify: false,
        confidence: 0.85,
        reason: pattern.reason,
      };
      logClassificationResult(rawInput, res);
      return res;
    }
  }

  // 2. Check Explicit Verification Requests
  for (const pattern of EXPLICIT_VERIFICATION_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      const res: DetectionResult = {
        shouldVerify: true,
        confidence: 0.9,
        reason: pattern.reason,
      };
      logClassificationResult(rawInput, res);
      return res;
    }
  }

  // 3. Check Declarative Factual Assertions (Verifiable Claims)
  const factualMatches = FACTUAL_ASSERTION_PATTERNS.filter((p) => p.regex.test(normalized));
  if (factualMatches.length > 0) {
    const res: DetectionResult = {
      shouldVerify: true,
      confidence: Math.min(0.95, 0.75 + factualMatches.length * 0.1),
      reason: factualMatches.map((m) => m.reason).join(" "),
    };
    logClassificationResult(rawInput, res);
    return res;
  }

  // 4. Declarative sentence heuristic check:
  // If the sentence is a declarative statement (not a question, not a simple 1-2 word phrase)
  // that asserts a fact or state of affairs (e.g. contains 4+ words and no question mark)
  const isQuestion = normalized.includes("?") || /^(ano|sino|kailan|saan|bakit|paano|what|who|where|when|why|how)\b/i.test(normalized);
  const wordCount = normalized.split(/\s+/).length;

  if (!isQuestion && wordCount >= 3) {
    const res: DetectionResult = {
      shouldVerify: true,
      confidence: 0.7,
      reason: "Declarative factual assertion: Statement asserts a claim about reality that can be objectively verified.",
    };
    logClassificationResult(rawInput, res);
    return res;
  }

  // Fallback for short or ambiguous inputs
  const res: DetectionResult = {
    shouldVerify: false,
    confidence: 0.5,
    reason: "No clear objectively verifiable claim found in statement.",
  };
  logClassificationResult(rawInput, res);
  return res;
}

export const isFactCheckingQuery = shouldRunVerificationPipeline;
