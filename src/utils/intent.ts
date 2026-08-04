/** Deterministic routing classifier; it never fact-checks the input. */

export const CLASSIFICATION_CATEGORIES = [
  "FACT_CHECKABLE", "NEEDS_CONTEXT", "OPINION", "PERSONAL_EXPERIENCE",
  "PREDICTION", "HYPOTHETICAL", "BELIEF", "INFORMATION_REQUEST", "COMMAND",
  "PRIVATE_OR_UNVERIFIABLE", "SATIRE_OR_MEME",
] as const;

export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number];
export type ClassificationRoute = "fact_check" | "ask_user" | "reject";

export interface DetectionResult {
  category: ClassificationCategory;
  canFactCheck: boolean;
  confidence: number;
  detectionConfidence: number;
  reason: string;
  claim: string;
  needs: string[];
  route: ClassificationRoute;
  shouldVerify: boolean;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

function cleanClaim(input: string): string {
  let claim = input.trim().replace(/[.!?]+$/, "").trim();
  claim = claim.replace(/^(totoo\s+ba(?:\s+na|\s+bang)?|totoo\s+bang|fake\s+ba(?:\s+na)?|tama\s+ba|mali\s+ba|tunay\s+ba)\s*/i, "");
  claim = claim.replace(/^(is\s+it\s+true\s+that|is\s+this\s+(true|accurate)|verify\s+(this|that))\s*/i, "");
  claim = claim.replace(/^(sa\s+tingin\s+ko|feeling\s+ko|i\s+think|people\s+say|sabi\s+nila)\s+/i, "");
  return claim.trim().replace(/[.!?]+$/, "").trim();
}

function hasSpecificSubject(claim: string): boolean {
  const words = claim.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  const hasSubjectSignal = /\b(si|ang|may|the|a|an|[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ'-]*|\d|₱|https?:\/\/)/u.test(claim);
  const startsWithUnresolvedReference = /^(he|she|they|someone|somebody|siya|sila)\b/i.test(claim);

  // Capitalization is useful for names, but it must not be required: users and
  // OCR frequently submit otherwise valid claims entirely in lowercase.
  return hasSubjectSignal || !startsWithUnresolvedReference;
}

function hasPredicate(claim: string): boolean {
  return /\b(is|are|was|were|has|have|had|did|does|do|will|said|says|announced|declared|banned|arrested|died|won|lost|signed|approved|passed|increased|decreased|reported|confirmed|denied|claimed|alleged|removed|lowered|raised|extended|visited|kills?|causes?|cures?|discovered|released|reached|dropped|happens?|happened|charging|erupted|struck|married|resigned|retired|running|mandatory|ay|tumaas|bumaba|nagtaas|nangyari|naganap|sinabi|inamin|kinumpirma|ipinagbawal|inalis|pinalaya|nanalo|namatay|nahatulan|may|meron|magkakaroon|libre|patay|buhay|umiikot|na-ban)\b/i.test(claim);
}

function isCompleteClaim(claim: string): boolean {
  const hasMeasurableValue = /\d|[%₱$€£¥]/.test(claim);
  return claim.length >= 12 && hasSpecificSubject(claim) && (hasPredicate(claim) || hasMeasurableValue);
}

function result(category: ClassificationCategory, confidence: number, reason: string, claim = "", needs: string[] = []): DetectionResult {
  const canFactCheck = category === "FACT_CHECKABLE";
  const route: ClassificationRoute = canFactCheck ? "fact_check" : category === "NEEDS_CONTEXT" ? "ask_user" : "reject";
  return { category, canFactCheck, confidence, detectionConfidence: confidence, reason, claim, needs, route, shouldVerify: canFactCheck };
}

export function shouldRunVerificationPipeline(input: string): DetectionResult {
  const raw = typeof input === "string" ? input.trim() : "";
  const text = normalize(raw);
  if (!text) return result("NEEDS_CONTEXT", 1, "No claim was provided.", "", ["claim"]);

  if (/^(?:\d+(?:\.\d+)?\s*[+*/=]\s*\d|solve\b|square\s+root\b)/i.test(text)) {
    return result("COMMAND", 0.99, "The input is a calculation request rather than a factual claim.");
  }
  if (/^(translate|summarize|summary|write|make|create|generate|draft|compose|draw|design|explain|define|fix|open|search|download|teach|solve|give\s+me|tell\s+me\s+a|isalin|sumulat|gumawa|ipaliwanag|i-translate)\b/i.test(text)) {
    return result("COMMAND", 0.98, "The input is an instruction rather than a factual claim.");
  }
  if (/\b(what if|suppose|imagine|paano kung|kung sakali)\b/i.test(text)) {
    return result("HYPOTHETICAL", 0.98, "The input describes an imaginary or hypothetical scenario.");
  }
  if (/\b(mananalo|matatalo)\b/i.test(text) || /^(is|are)\b.+\bgoing to\b/i.test(text)) {
    return result("PREDICTION", 0.94, "The input concerns a future event or outcome.");
  }
  if (/\b(god|diyos|religion|faith|belief|spiritual|supernatural|himala|sumpa|swerte)\b/i.test(text)) {
    return result("BELIEF", 0.96, "The input concerns a religious, philosophical, or supernatural belief.");
  }
  if (/^(naranasan ko|nararamdaman ko|feeling ko)\b/i.test(text) || /\b(i|my|ako|aking)\b.*\b(felt|feel|experienced|naranasan|masakit|masaya|malungkot|nagkasakit)\b/i.test(text)) {
    return result("PERSONAL_EXPERIENCE", 0.96, "The input describes the user's own experience or feeling.");
  }

  const extracted = cleanClaim(raw);
  if (/\b(opinion|i prefer|favorite|mas maganda|mas masarap|mas mabuti|mas mahusay|mas magaling|dapat ba akong|sa tingin mo|is\s+the\s+best|is\s+better\s+than)\b/i.test(text)) {
    if (!/^(sa\s+tingin\s+ko|feeling\s+ko|i\s+think|people\s+say|sabi\s+nila)\b/i.test(text) || !isCompleteClaim(extracted)) {
      return result("OPINION", 0.97, "The input expresses a preference or subjective value judgment.");
    }
  }
  if (/^fake\s*news\s*(ba\s*)?(ito|yan)?\??$/i.test(text)) {
    return result("NEEDS_CONTEXT", 0.97, "A broad label was provided without the claim or content to assess.", "", ["claim"]);
  }
  if (/\b(meme|lol|haha|sarcasm|sarcastic|joke)\b/i.test(text)) {
    return result("SATIRE_OR_MEME", 0.93, "The input appears to be a joke, meme, satire, or broad label.");
  }
  if (/\b(sex life|private chat|private conversation|intimate|leaked nude|titi|puki|boobs|penis|vagina|jowa|gf|bf)\b/i.test(text)) {
    return result("PRIVATE_OR_UNVERIFIABLE", 0.96, "The input concerns private, intimate, or non-public personal information.");
  }

  if (/^(who|what|where|when|why|how|ano|sino|saan|kailan|bakit|paano)\b/i.test(text)) {
    return result("INFORMATION_REQUEST", 0.94, "Requests information or an explanation without asserting a specific claim.");
  }

  const explicit = /\b(totoo\s+ba|totoo\s+bang|tama\s+ba|mali\s+ba|tunay\s+ba|fact\s*check|verify|debunk|is\s+it\s+true|fake\s+ba|fake\s+news)\b/i.test(text);
  const factual = hasPredicate(extracted) || /\b(pinaka[\w-]+|may batas)\b/i.test(extracted);
  if (explicit && !isCompleteClaim(extracted)) {
    return result("NEEDS_CONTEXT", 0.94, "A verification request was detected, but the factual proposition is incomplete.", "", ["claim"]);
  }
  if (isCompleteClaim(extracted) && (explicit || factual || /\?/.test(raw) || /\d|%|₱|\b(according to|ayon sa)\b/i.test(extracted))) {
    return result("FACT_CHECKABLE", explicit ? 0.99 : 0.91, "Contains a specific, objective, publicly verifiable factual claim.", extracted);
  }
  if (/^(sinungaling|scammer|corrupt|masama|magaling|mabuti|pangit)\b/i.test(text) || /\b(he|she|siya)\s+(is|ay)\s+(a\s+)?(liar|sinungaling)\b/i.test(text)) {
    return result("NEEDS_CONTEXT", 0.95, "The subject or supporting proposition is not identified.", "", ["person"]);
  }
  if (text.split(/\s+/).length < 5) return result("NEEDS_CONTEXT", 0.78, "The input is too short or vague to identify a verifiable claim.", "", ["claim"]);
  return result("NEEDS_CONTEXT", 0.68, "The input does not contain enough specific context to verify.", "", ["person", "place", "date"]);
}

export const isFactCheckingQuery = shouldRunVerificationPipeline;