# Teka Muna — Services

## Frontend Services (`src/services/`)

---

### api.ts

The single HTTP client for all Worker API calls. No component calls `fetch()` directly.

**Exports:**
- `verifyClaim(payload)` — POST /api/verify → VerifyResult
- `analyzeImage(file)` — POST /api/analyze-image → ImageAnalysisResult
- `ApiServiceError` — typed error class with optional HTTP status

**Usage:**
```ts
import { verifyClaim, ApiServiceError } from "@/services/api";
```

---

### historyService.ts

Manages the user's verification history in sessionStorage.

**Exports:**
- `appendToHistory(result)` — prepends a result, deduplicates, caps at 50
- `loadHistory()` — reads history array, returns [] on error

**Why it exists:**
Moved from HistoryPage.tsx to break the circular dependency where useVerify imported from a page component.

**Usage:**
```ts
import { appendToHistory, loadHistory } from "@/services/historyService";
```

---

## Worker Services (`worker/services/`)

---

### gemini.ts — Fact-Check Analysis Service

The main entry point for the fact-checking pipeline. Despite its filename (legacy — was Gemini-specific), it now routes through AIManager which tries OpenRouter first.

**Exports:**
- `analyseEvidence(input)` — full pipeline: score sources → build prompt → AI verdict call → VerifyResult

**Pipeline:**
1. Build `ScoredSourceIndex` from all Tavily results (no AI)
2. Rank sources by credibility, select top 5
3. Single VERDICT AI call via AIManager
4. Return VerifyResult with ALL sources in reliableSources

**Rename note:** This file should eventually be renamed to `analyzeService.ts` to reflect its provider-agnostic role.

---

### credibility.ts — Source Scoring

Pure backend credibility scoring. No AI calls.

**Exports:**
- `scoreSource(url)` — returns `{ score: 0–100, category: string }`
- `buildScoredSourceIndex(results)` — attaches credibility metadata to all SearchResults
- `credibilityRulesPrompt()` — system prompt section explaining evidence-first rules to AI

**Important:** Evidence-first design — credibility scores weight AI *confidence*, they never gate which sources the AI sees.

---

### tavily.ts — Web Search

Wrapper around the Tavily Search API.

**Exports:**
- `searchWeb(claim, apiKey)` — returns `SearchResult[]`

---

### ImageAnalyser.ts — Vision Pipeline

Manages image-to-claim extraction via vision AI providers.

**Exports:**
- `analyseImage(input)` — validates image, runs vision provider chain, returns `ImageAnalysisResult`
- `validateImageFile(file)` — client-side validation helper

**Provider chain:** OpenRouterVisionProvider (key 1) → OpenRouterVisionProvider (key 2) → GeminiVisionProvider

---

### EvidenceExtractor.ts, EvidenceMerger.ts, PromptBuilder.ts

> **Status: Preserved but not called in the current pipeline.**

These implement the full multi-phase evidence pipeline:
- EvidenceExtractor: one small AI call per article (~400 tokens each)
- EvidenceMerger: pure backend clustering and contradiction detection
- PromptBuilder: token-budget-aware compact prompt generation

They are disabled because the free tier rate limits prevent multiple AI calls per request. Re-enable by restoring the Phase 1/2/3 logic in `gemini.ts` when paid quota is available.

---

## Worker AI Layer (`worker/ai/`)

---

### AIManager.ts

Central AI orchestrator — the only object that calls providers directly.

**Responsibilities:**
- Model selection per task from `config/models.ts`
- Retry logic: try model with key 1, then key 2, then next model
- Health tracking: success/failure counts, avg latency, cooldown
- Quota detection: 429 / "afford" / "credits" → immediate 5-min cooldown
- Request logging: last 100 requests in memory

**Singleton pattern:**
`getManager()` in `gemini.ts` creates one AIManager per Worker isolate. This ensures health/cooldown state persists across requests. A new instance is only created if the API keys change.

**How to add a provider:**
1. Implement `BaseProvider` in `worker/ai/providers/`
2. Add to `AIManager` constructor
3. Update `resolveProvider()` in `config/models.ts`

---

### config/models.ts

Per-task model priority lists. The only place model IDs are hardcoded.

**Override at runtime** via `.dev.vars` or Cloudflare secrets:
```
MODELS_VERDICT=deepseek/deepseek-chat:free,qwen/qwen3-32b:free
```

**Tasks:** `VERDICT`, `EVIDENCE_EXTRACTION`, `SUMMARY`, `SEARCH_QUERY`, `TRANSLATION`
