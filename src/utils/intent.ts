/**
 * src/utils/intent.ts
 *
 * Language-agnostic intent classifier for determining whether a user input
 * should enter the Fact-Checking Pipeline or be routed to Normal AI Chat.
 *
 * Classification principle:
 *   "Does this input contain a verifiable factual proposition?"
 *   YES → Fact-check pipeline (shouldVerify: true)
 *   NO  → Normal AI chat  (shouldVerify: false)
 *
 * Sentence type (question vs. statement) does NOT determine routing.
 * Verifiable interrogatives are normalized to their underlying declarative
 * claim before detection:
 *
 *   Input                                        Underlying claim            Pipeline
 *   ───────────────────────────────────────────  ──────────────────────────  ────────
 *   Totoo bang libre ang COVID vaccine?          Libre ang COVID vaccine.    ✅
 *   Na-ban na ba ang TikTok sa Pilipinas?        Na-ban ang TikTok.          ✅
 *   Sinabi ba ni Sara Duterte na mag-hire…?      Sinabi ni Sara Duterte…     ✅
 *   May batas ba na nagbabawal sa social media?  May batas na nagbabawal…    ✅
 *   Ano ang TikTok?                              — (definitional)            ❌
 *   Sino si Sara Duterte?                        — (identity)                ❌
 *   Bakit mataas ang inflation?                  — (explanatory)             ❌
 *
 * Pipeline (first match wins):
 *   1. Reject non-verifiable question openers — definitional ("Ano ang X?"),
 *      identity ("Sino si X?"), explanatory ("Bakit X?"), instructional
 *      ("Paano X?"), locational, temporal. These cannot yield checkable claims.
 *   2. Reject creative / task requests.
 *   3. Reject subjective / religious / opinion content.
 *   4. Accept explicit fact-check trigger phrases.
 *   5. Accept inputs containing verifiable factual assertion patterns
 *      (Filipino and English verbs, status terms, topic entities).
 *   6. Accept verifiable interrogative frames — question structures that
 *      inherently query a real-world checkable fact.
 *   7. Heuristic: inputs with 5+ words not caught above → likely a claim.
 *   8. Fallback: reject short or ambiguous inputs.
 *
 * Note on normalization:
 *   The normalizer strips hyphens (e.g. "na-ban" → "na ban"). All patterns
 *   are therefore tested against BOTH the normalized text AND the raw
 *   lowercased text so Filipino affixed words (na-ban, pinaka-polluted,
 *   nag-resign) are always matched.
 */

export interface DetectionResult {
  shouldVerify: boolean;
  /**
   * Indicates how confidently the claim detector classified the input as a
   * fact-checkable claim based on routing heuristics and pattern matching.
   * It is NOT the AI model's confidence in the truthfulness of the claim or
   * the final verdict.
   */
  detectionConfidence: number;
  reason: string;
}

interface ClassificationPattern {
  regex: RegExp;
  reason: string;
}

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[""„«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\w\s?]/g, " ")   // hyphens and special chars → space
    .replace(/\s+/g, " ")
    .trim();
}

// ── Step 1: Non-Verifiable Question Openers ───────────────────────────────────
// Anchored (^) — only fire when the input STARTS with these words.
// These question types can never yield an objectively checkable claim.

const NON_VERIFIABLE_QUESTION_PATTERNS: ClassificationPattern[] = [
  // Filipino: "Ano ang X?" / "Ano ba ang X?" / "Anong X?" → definitional
  { regex: /^\s*(ano\s+(ba\s+)?(ang|ibig\s+sabihin(\s+ng)?)|anong)\b/i,
    reason: "Non-verifiable query: Definitional question (Ano ang...)." },
  // Open-ended questions without specific checkable propositions (e.g., "ano nangyari", "what happened")
  { regex: /^\s*(ano\s+nangyari|anong\s+nangyari|what\s+happened|whats\s+happening|what\s+is\s+happening)\b/i,
    reason: "Non-verifiable query: Broad, open-ended question requesting general status/news summary." },
  // Filipino: "Sino si X?" / "Sino ang X?" → identity
  { regex: /^\s*sino\s+(si|ang|ba)\b/i,
    reason: "Non-verifiable query: Identity question (Sino si...)." },
  // Filipino: "Bakit X?" → explanatory / causal
  { regex: /^\s*bakit\b/i,
    reason: "Non-verifiable query: Explanatory question (Bakit...)." },
  // Filipino: "Paano X?" → instructional / how-to
  { regex: /^\s*paano\b/i,
    reason: "Non-verifiable query: Instructional question (Paano...)." },
  // Filipino: "Saan X?" → locational
  { regex: /^\s*saan\b/i,
    reason: "Non-verifiable query: Locational question (Saan...)." },
  // Filipino: "Kailan X?" → temporal
  { regex: /^\s*kailan\b/i,
    reason: "Non-verifiable query: Temporal question (Kailan...)." },
  // English: "What is/are/was/were X?" → definitional
  { regex: /^\s*what\s+(is|are|was|were|does\s+.+\s+mean)\b/i,
    reason: "Non-verifiable query: Definitional question (What is...)." },
  // English: "Who is/are/was/were X?" → identity
  { regex: /^\s*who\s+(is|are|was|were)\b/i,
    reason: "Non-verifiable query: Identity question (Who is...)." },
  // English: "Why X?" → explanatory
  { regex: /^\s*why\b/i,
    reason: "Non-verifiable query: Explanatory question (Why...)." },
  // English: "How to/do/can/does/should X?" → instructional
  { regex: /^\s*how\s+(to|do|can|does|should|would|is|are|was|were)\b/i,
    reason: "Non-verifiable query: Instructional question (How to...)." },
  // English: "Where is/are X?" → locational
  { regex: /^\s*where\s+(is|are|was|were|can|do|does)\b/i,
    reason: "Non-verifiable query: Locational question (Where is...)." },
  // English: "When is/was/will X?" → temporal
  { regex: /^\s*when\s+(is|are|was|were|will|did|does|do)\b/i,
    reason: "Non-verifiable query: Temporal question (When is...)." },
  // English: "Which is/are X?" → selection / comparative
  { regex: /^\s*which\s+(is|are|was|were|one)\b/i,
    reason: "Non-verifiable query: Selection question (Which is...)." },
  // General: Explain / define / describe requests
  { regex: /^\s*(explain|define|describe|tell\s+me\s+(about|what|who|why|how|when|where))\b/i,
    reason: "Non-verifiable request: Explanation or definition request." },
];

// ── Step 2: Creative / Task Patterns ─────────────────────────────────────────

const CREATIVE_OR_TASK_PATTERNS: ClassificationPattern[] = [
  { regex: /\b(gumawa|sumulat|ikwento|isalin|ipaliwanag|mag-generate|mag-design|mag-draw|tula|birthday\s+greeting|kwento)\b/i,
    reason: "Non-verifiable request: Creative or task command." },
  { regex: /\b(write|tell\s+me\s+a\s+(joke|story)|compose|create|generate|draft|draw|paint|design|translate|summarize|summary|poem|story|email)\b/i,
    reason: "Non-verifiable request: Creative or task command." },
];

// ── Step 3: Subjective / Religious / Opinion ──────────────────────────────────

const SUBJECTIVE_OR_RELIGIOUS_PATTERNS: ClassificationPattern[] = [
  { regex: /\b(diyos|god|faith|belief|religion|spiritual|spirituality)\b/i,
    reason: "Non-verifiable statement: Philosophical or religious content." },
  { regex: /\b(favorite|recommend|should\s+i|opinion|mas\s+maganda|mas\s+mabuti)\b/i,
    reason: "Non-verifiable query: Subjective opinion or recommendation." },
  // Non-specific vague commentary or general labels ("fake news yan", "that's fake news") without referencing any proposition
  { regex: /^\s*(fake\s*news\s*(yan|ito|na\s*man|lang|at\s*iba\s*pa)|that\s*is\s*fake\s*news|its\s*fake\s*news)\s*$/i,
    reason: "Non-verifiable statement: Broad label or commentary without specifying any claim/proposition." },
  // Intimate, sensitive, private personal attributes, body parts, sexual matters, or gossip-oriented terms
  { regex: /\b(titi|puki|pepe|pake|dede|boobs|breast|breasts|penis|vagina|sex\s+life|jowa|gf|bf|boyfriend|girlfriend|anatom|dick|cock|pussy|sexual\s+orientation|gay|lesbian|homosexual|biyahe\s+ng\s+pribado|scandal|leak|butt|wet|ass|kantot|kantutan|sex|nude)\b/i,
    reason: "Non-verifiable query: Intimate, sensitive, or private personal attribute, body part, or gossip-oriented matter." },
];

// ── Step 4: Explicit Fact-Check Triggers ─────────────────────────────────────

const EXPLICIT_FACT_CHECK_PATTERNS: ClassificationPattern[] = [
  { regex: /\btotoo\s+(ba|bang)\b/i,
    reason: "Explicit Filipino fact-check query (Totoo ba/bang...)." },
  { regex: /\b(tama\s+ba|mali\s+ba|tunay\s+ba)\b/i,
    reason: "Explicit Filipino truth/accuracy query." },
  { regex: /\bfake\s*news\b/i,
    reason: "Contains fake news query." },
  { regex: /\b(fact\s*check|verify|debunk|hoax|misleading|misinformation|disinformation)\b/i,
    reason: "Explicit verification request." },
  { regex: /\bis\s+it\s+true\s+that\b/i,
    reason: "Explicit English fact-check query (Is it true that...)." },
  { regex: /\b(is|are|was|were|did|does|do)\b.{1,100}\b(true|real|authentic|accurate|really\s+happened|actually\s+said|hoax|fabricated)\b/i,
    reason: "Asks whether a statement or event is true or accurate." },
];

// ── Step 5: Verifiable Factual Assertion Patterns ─────────────────────────────
// Match verifiable CONTENT regardless of sentence type — works on both
// questions and statements. Tested against both normalized and rawLower.

const FACTUAL_ASSERTION_PATTERNS: ClassificationPattern[] = [
  // Filipino: policy / law / event verbs
  { regex: /\b(libre\s+ang|ipinagbawal|idineklara|naratipikahan|nag-anunsyo|inanunsyo|natuklasan|nabunyag|napatunayan|naganap|nangyari|napatay|pinalaya|nasunog|nailuklok|naihalal)\b/i,
    reason: "Contains a Filipino verifiable policy or event assertion." },
  // Filipino: speech-act and political-action verbs
  { regex: /\b(sinabi|inamin|kinumpirma|itinanggi|ipinahayag|iginiit|binalaan|nanawagan|nagbitiw|bumoto|pumirma|nagsampa|nag-file|nag-resign|nag-announce|nag-anunsyo|inakusahan)\b/i,
    reason: "Contains a verifiable Filipino speech-act or political-action verb." },
  // Filipino: event / status verbs
  { regex: /\b(naaresto|nakulong|nabitay|naparusahan|nahatulan|naakusahan|napalaya|napalipat|nasuspinde|natanggal|naalis|naluklok|nanalo|natalo|namatay|nasunog|naaksidente)\b/i,
    reason: "Contains a Filipino verifiable event or status verb." },
  // Filipino: superlative factual claims (rawLower preserves "pinaka-polluted")
  { regex: /\b(pinakamataas|pinakamababa|pinakamabilis|pinakamalaki|pinakamaliit|pinaka-\w+|pinaka\w{5,})\b/i,
    reason: "Contains a Filipino superlative factual claim." },
  // Filipino: metric change and existence assertions
  { regex: /\b(bumaba\s+ang|tumaas\s+ang|lumaki\s+ang|dumami\s+ang|bumilis\s+ang|may\s+pinaka)\b/i,
    reason: "Contains a Filipino metric change or superlative existence claim." },
  // English: factual assertion verbs (comprehensive)
  { regex: /\b(declared|announced|arrested|died|passed\s+away|shut\s+down|resigned|suspended|banned|closed|charged|indicted|launched|approved|signed|enacted|removed|fired|sued|caught|killed|acquired|merged|cancelled|canceled|leaked|revealed|confirmed|denied|released|detained|injured|attacked|crashed|became|become|reported|won|lost|decreased|increased|convicted|acquitted|impeached|sentenced|executed|pardoned|elected|appointed|dismissed|deployed|captured|surrendered|collapsed|recovered|expired|extended|vetoed|overturned|upheld|admitted|claimed|alleged|accused|stated)\b/i,
    reason: "Contains a verifiable English factual assertion verb." },
  // Current-status terms
  { regex: /\b(dead|alive|still\s+alive|still\s+living|still\s+in\s+office|in\s+jail|in\s+prison)\b/i,
    reason: "Contains a verifiable current-status term." },
  // Filipino death / alive status (handles "patay naba", "patay na ba", "buhay pa ba")
  { regex: /\bpatay\s*(na\s*ba|naba|na)\b/i,
    reason: "Contains a verifiable Filipino death-status assertion or query." },
  { regex: /\bbuhay\s*(pa\s*ba|paba|pa)\b/i,
    reason: "Contains a verifiable Filipino alive-status assertion or query." },
  // Metric / geopolitical topic entities
  { regex: /\b(unemployment|inflation|covid|vaccine|olympic|gold\s+medal|martial\s+law|asean|gdp|presidency|election|magnitude|death\s+toll|casualty|minimum\s+wage|budget\s+deficit|crime\s+rate|poverty\s+rate)\b/i,
    reason: "Contains a concrete verifiable metric or geopolitical entity." },
  // Philippine legal / institutional references
  { regex: /\b(republic\s+act|executive\s+order|ra\s+\d|eo\s+\d|senate\s+bill|supreme\s+court|comelec|ombudsman|sandiganbayan)\b/i,
    reason: "References a Philippine legal instrument or institution." },
];

// ── Step 6: Verifiable Interrogative Frames ───────────────────────────────────
// Question structures that inherently query real-world checkable facts.
// Tested against rawLower to preserve hyphenated Filipino affixes.

const VERIFIABLE_INTERROGATIVE_PATTERNS: ClassificationPattern[] = [
  // "Sinabi ba ni [person] na...?" → speech-act query
  { regex: /\bsinabi\s+ba\s+ni\b/i,
    reason: "Asks whether a named person said something — verifiable speech claim." },
  // "May batas/utos/patakaran ba na...?" → law / policy existence query
  { regex: /\bmay\s+(batas|utos|patakaran|resolusyon|kautusan|republic\s+act|executive\s+order)\b/i,
    reason: "Asks whether a law or official policy exists — verifiable legal claim." },
  // "Na-/Nag-/Naka-/Nai- [verb] (na) ba" → Filipino past-action question
  // Must test rawLower to preserve the hyphen in Filipino affixes.
  { regex: /\b(na-|nag-|naka-|nai-)\w{2,}(\s+na)?\s+ba\b/i,
    reason: "Asks whether a past verifiable action occurred (Filipino interrogative)." },
  // "[verb] ba si [person]" → named-person event query in Filipino
  { regex: /\b\w{3,}\s+ba\s+si\s+\w/i,
    reason: "Asks about a verifiable action or status of a named Filipino person." },
  // English: "Did [subject] [action]?"
  { regex: /\bdid\s+\w.{3,}\?/i,
    reason: "Asks whether a past verifiable event occurred." },
  // English: "Was/Were [subject] [state/action]?"
  { regex: /\b(was|were)\s+\w.{3,}\?/i,
    reason: "Asks about a verifiable past state or event." },
  // English: "Has/Have [subject] [verb]?"
  { regex: /\b(has|have)\s+\w.{3,}\?/i,
    reason: "Asks about a verifiable recent event." },
];

// ── Logging ───────────────────────────────────────────────────────────────────

function logClassificationResult(_input: string, _result: DetectionResult): void {
  // Intentionally silent in production.
}

// ── Main Classifier ───────────────────────────────────────────────────────────

export function shouldRunVerificationPipeline(input: string): DetectionResult {
  const rawInput = input ? input.trim() : "";
  const rawLower = rawInput.toLowerCase();
  const normalized = normalizeInput(rawInput);

  function emit(shouldVerify: boolean, detectionConfidence: number, reason: string): DetectionResult {
    const res: DetectionResult = { shouldVerify, detectionConfidence, reason };
    logClassificationResult(rawInput, res);
    return res;
  }

  // Test a pattern against both normalized text (hyphens stripped) and rawLower
  // (hyphens preserved) so Filipino affixed words are always matched.
  function hits(pattern: RegExp): boolean {
    return pattern.test(normalized) || pattern.test(rawLower);
  }

  if (normalized.length === 0) {
    return emit(false, 0, "Empty input cannot be classified for verification.");
  }

  // ── 1. Non-Verifiable Question Openers ──────────────────────────────────────
  for (const p of NON_VERIFIABLE_QUESTION_PATTERNS) {
    if (hits(p.regex)) return emit(false, 0.92, p.reason);
  }

  // ── 2. Creative / Task ───────────────────────────────────────────────────────
  for (const p of CREATIVE_OR_TASK_PATTERNS) {
    if (hits(p.regex)) return emit(false, 0.95, p.reason);
  }

  // ── 3. Subjective / Religious / Opinion ─────────────────────────────────────
  // Must run BEFORE step 4 so religious questions like "Totoo ba ang diyos?"
  // are correctly routed to chat despite containing "totoo ba".
  for (const p of SUBJECTIVE_OR_RELIGIOUS_PATTERNS) {
    if (hits(p.regex)) return emit(false, 0.85, p.reason);
  }

  // ── 4. Explicit Fact-Check Triggers ─────────────────────────────────────────
  for (const p of EXPLICIT_FACT_CHECK_PATTERNS) {
    if (hits(p.regex)) return emit(true, 0.92, p.reason);
  }

  // ── 5. Verifiable Factual Assertion Patterns ─────────────────────────────────
  // Collect all matches for compound confidence scoring.
  const factualMatches = FACTUAL_ASSERTION_PATTERNS.filter((p) => hits(p.regex));
  if (factualMatches.length > 0) {
    return emit(
      true,
      Math.min(0.97, 0.78 + factualMatches.length * 0.09),
      factualMatches.map((m) => m.reason).join(" "),
    );
  }

  // ── 6. Verifiable Interrogative Frames ──────────────────────────────────────
  for (const p of VERIFIABLE_INTERROGATIVE_PATTERNS) {
    if (hits(p.regex)) return emit(true, 0.88, p.reason);
  }

  // ── 7. Heuristic ─────────────────────────────────────────────────────────────
  // At this point the input was NOT caught by any non-verifiable pattern.
  // Inputs with 5+ words that aren't definitional, creative, or subjective
  // are treated as likely containing a verifiable factual claim.
  // (No isQuestion restriction — sentence type is irrelevant to verifiability.)
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount >= 5) {
    return emit(
      true,
      0.65,
      "Heuristic: input has 5+ words and is not classified as definitional, creative, or subjective — likely contains a verifiable claim.",
    );
  }

  // ── 8. Fallback ──────────────────────────────────────────────────────────────
  return emit(false, 0.5, "No verifiable factual proposition detected in this input.");
}

export const isFactCheckingQuery = shouldRunVerificationPipeline;
