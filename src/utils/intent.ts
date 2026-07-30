export interface DetectionResult {
  shouldVerify: boolean;
  confidence: number;
  reason: string;
}

const EXPLICIT_VERIFICATION_PATTERNS: Array<{ regex: RegExp; weight: number; reason: string }> = [
  {
    regex: /\bfact\s*check\b/, weight: 0.45,
    reason: "Contains an explicit verification request.",
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
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would)\b.*\b(true|real|authentic|accurate|accurately|news|claim|information|misleading|hoax|fake)\b/, weight: 0.35,
    reason: "Asks about truth, authenticity, or accuracy.",
  },
  {
    regex: /\b(did .* really|did .* happen|is .* real|is .* authentic|is .* accurate|is .* true|is .* news accurate|is .* information|did .* say this)\b/, weight: 0.35,
    reason: "Asks whether a specific claim, event, or statement is real.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would|will)\b.*\b(go(?:ing)? to|join(?:ing)?|transfer|sign(?:ing)?|move(?:s|d)? to|play for|sign for)\b/, weight: 0.45,
    reason: "Asks whether a specific event or transfer rumor is true.",
  },
  {
    regex: /\b(fake news|fake|hoax|debunk|misleading|misinformation|disinformation)\b/, weight: 0.45,
    reason: "Mentions misinformation-related language.",
  },
];

const STANDALONE_CLAIM_PATTERNS: Array<{ regex: RegExp; weight: number; reason: string }> = [
  {
    regex: /\b(declared|announced|arrested|died|passed away|shut down|shutting down|resigned|suspended|banned|closed|charged|indicted|launched|approved|signed|enacted|removed|fired|sued|caught|killed|acquired|merged|split|cancelled|canceled|leaked|revealed|confirmed|denied|released|detained|injured|attacked|exploded|crashed|contained|contains|contain|became|become|reported)\b/, weight: 0.35,
    reason: "Contains a news-style factual claim verb.",
  },
  {
    regex: /\b(?:yesterday|today|tomorrow|last week|last month|next month|next year|this week|tonight|currently|now)\b/, weight: 0.15,
    reason: "Contains a time indicator commonly found in news claims.",
  },
  {
    regex: /\b(?:facebook|tiktok|gcash|pope|marcos|duterte|bbm|icc|philippines|covid|coronavirus|vaccine|trump|biden|sports|nba|sixers|news|headline|post|tweet|article)\b/, weight: 0.1,
    reason: "Mentions a concrete entity or newsworthy topic.",
  },
  {
    regex: /\b(?:claim|rumor|headline|news|statement)\b/, weight: 0.1,
    reason: "Refers to a claim or news item.",
  },
];

const NON_VERIFIABLE_PATTERNS: Array<{ regex: RegExp; weight: number; reason: string }> = [
  {
    regex: /\b(translate|summarize|summary|story|poem|email|write( me)?|explain|tell me about|best|better than|opinion|favorite|recommend(ed)?|generate|image|draw|design|paint|compose)\b/, weight: 0.5,
    reason: "Looks like a creative or content-generation request.",
  },
  {
    regex: /\b(best|better than|favorite|recommend(ed)?|should i|which .* should i|which .* is better|opinion|personal preference)\b/, weight: 0.45,
    reason: "Looks like an opinion or recommendation request.",
  },
  {
    regex: /\b(who|what|where|when|why|how)\b.*\b(is|are|was|were|does|do|did)\b/, weight: 0.35,
    reason: "Looks like a general knowledge question rather than a verifiable claim.",
  },
  {
    regex: /\b(is|are|was|were|did|does|do|can|could|should|would|may|might)\b.*\b(diyos|god|faith|belief|religion|spiritual|spirituality)\b/, weight: 0.4,
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

export function shouldRunVerificationPipeline(input: string): DetectionResult {
  const normalized = normalizeInput(input);

  if (normalized.length === 0) {
    return {
      shouldVerify: false,
      confidence: 0,
      reason: "Empty input cannot be classified for verification.",
    };
  }

  const isQuestion = normalized.includes("?") || /^\b(is|are|was|were|did|does|do|can|could|should|would|may|might)\b/.test(normalized);

  const explicitMatches = EXPLICIT_VERIFICATION_PATTERNS.filter((item) => item.regex.test(normalized));
  const claimMatches = STANDALONE_CLAIM_PATTERNS.filter((item) => item.regex.test(normalized));
  const negativeMatches = NON_VERIFIABLE_PATTERNS.filter((item) => item.regex.test(normalized));

  let score = 0;
  for (const match of explicitMatches) score += match.weight;
  for (const match of claimMatches) score += match.weight;
  for (const match of negativeMatches) score -= match.weight;
  if (isQuestion) score += 0.05;
  if (normalized.length > 120) score += 0.05;
  const confidence = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  const hasStrongNegative = negativeMatches.some((item) => item.weight >= 0.4);
  const shouldVerify = explicitMatches.length > 0 || (claimMatches.length > 0 && confidence >= 0.445);

  if (hasStrongNegative) {
    return {
      shouldVerify: false,
      confidence,
      reason: negativeMatches.map((item) => item.reason).join(" "),
    };
  }

  if (shouldVerify) {
    const reasonParts = explicitMatches.length > 0 ? explicitMatches : claimMatches;
    return {
      shouldVerify: true,
      confidence,
      reason: reasonParts.map((item) => item.reason).join(" "),
    };
  }

  if (negativeMatches.length > 0) {
    return {
      shouldVerify: false,
      confidence: Math.max(0.2, 1 - confidence),
      reason: negativeMatches.map((item) => item.reason).join(" "),
    };
  }

  return {
    shouldVerify: false,
    confidence,
    reason: "No clear verification-worthy claim found. Please enter a statement or news item you'd like verified.",
  };
}

export const isFactCheckingQuery = shouldRunVerificationPipeline;
