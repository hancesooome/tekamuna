export interface DetectionResult {
  isFactCheck: boolean;
  confidence: number;
  reason: string;
}

const FACT_CHECK_PATTERNS: Array<{ regex: RegExp; weight: number; reason: string }> = [
  {
    regex: /\bfact\s*check\b/, weight: 0.45,
    reason: "Contains an explicit fact-check request.",
  },
  {
    regex: /\bverify( this| this claim| this statement| whether| if)?\b/, weight: 0.45,
    reason: "Contains a verification request.",
  },
  {
    regex: /\btotoo ba\b/, weight: 0.45,
    reason: "Contains a Filipino fact-check phrase.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would)\b.*\b(true|real|authentic|accurate|accurately|news|claim|information|misleading|hoax|fake)\b/, weight: 0.3,
    reason: "Asks about truth, authenticity, or accuracy.",
  },
  {
    regex: /\b(did .* really|did .* happen|is .* real|is .* authentic|is .* accurate|is .* true|is .* news accurate|is .* information|did .* say this)\b/, weight: 0.3,
    reason: "Asks whether a specific claim, event, or statement is real.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would|will)\b.*\bgoing to\b/, weight: 0.35,
    reason: "Asks whether a future action or rumor is true.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would|will)\b.*\b(go(?:ing)? to|join(?:ing)?|transfer|sign(?:ing)?|move(?:s|d)? to|play for|sign for)\b/, weight: 0.45,
    reason: "Asks whether a specific event or transfer rumor is true.",
  },
  {
    regex: /\b(fake news|fake|hoax|debunk|misleading|misinformation|disinformation)\b/, weight: 0.45,
    reason: "Mentions misinformation-related language.",
  },
  {
    regex: /\b(image|video|screenshot|headline|post|tweet|facebook|tiktok|viral|shared|article)\b/, weight: 0.08,
    reason: "References media content or a viral post.",
  },
  {
    regex: /\b(claim|statement)\b/, weight: 0.08,
    reason: "Refers to a claim or statement.",
  },
];

const NON_FACT_CHECK_PATTERNS: Array<{ regex: RegExp; weight: number; reason: string }> = [
  {
    regex: /\b(who|what|where|when|why|how)\b.*\b(is|are|was|were|does|do|did)\b/, weight: 0.35,
    reason: "Looks like a general knowledge question.",
  },
  {
    regex: /\b(translate|summarize|summary|story|poem|email|write( me)?|explain|tell me about|best|better than|opinion|favorite|recommend(ed)?)\b/, weight: 0.4,
    reason: "Looks like a creative, opinion, or general knowledge request.",
  },
  {
    regex: /\b(react|vue|javascript|ai|inflation|president|climate change|jose rizal|who is|what is|how does)\b/, weight: 0.25,
    reason: "Mentions a general topic rather than a specific verification request.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would|may|might)\b.*\b(diyos|god|faith|belief|religion|spiritual|spirituality)\b/, weight: 0.35,
    reason: "Seems to ask about religious or philosophical belief rather than a factual claim.",
  },
];

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[“”„«»]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[^\w\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isFactCheckingQuery(input: string): DetectionResult {
  const normalized = normalizeInput(input);

  if (normalized.length === 0) {
    return {
      isFactCheck: false,
      confidence: 0,
      reason: "Empty input cannot be classified as a fact-check request.",
    };
  }

  const isQuestion = normalized.includes("?") || /^\b(is|are|was|were|did|does|do|can|could|should|would|may|might)\b/.test(normalized);

  const positiveMatches = FACT_CHECK_PATTERNS
    .filter((item) => item.regex.test(normalized));
  const negativeMatches = NON_FACT_CHECK_PATTERNS
    .filter((item) => item.regex.test(normalized));

  let score = 0;
  for (const match of positiveMatches) score += match.weight;
  for (const match of negativeMatches) score -= match.weight;
  if (isQuestion) score += 0.05;
  if (normalized.length > 120) score += 0.05;

  const confidence = Math.max(0, Math.min(1, score));

  if (confidence >= 0.55 && positiveMatches.length > 0) {
    return {
      isFactCheck: true,
      confidence,
      reason: positiveMatches.map((item) => item.reason).join(" "),
    };
  }

  if (negativeMatches.length > 0 && confidence < 0.5) {
    return {
      isFactCheck: false,
      confidence: Math.max(0.2, 1 - confidence),
      reason: negativeMatches.map((item) => item.reason).join(" "),
    };
  }

  if (confidence >= 0.45) {
    return {
      isFactCheck: true,
      confidence,
      reason: positiveMatches.length > 0
        ? positiveMatches.map((item) => item.reason).join(" ")
        : "The input resembles a fact-check request.",
    };
  }

  return {
    isFactCheck: false,
    confidence,
    reason: "No clear fact-check intent detected. Please enter a claim, statement, or news item you want verified.",
  };
}
