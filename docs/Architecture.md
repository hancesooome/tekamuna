# Teka Muna — Architecture

## Overview

Teka Muna is a Filipino AI-powered fact-checking platform built on **Cloudflare Pages + Workers**. The frontend is a React SPA; the backend is a stateless Cloudflare Worker that orchestrates AI and web search APIs.

```
Browser (React SPA)
      │
      │  /api/*  (proxied in dev, same domain in prod)
      ▼
Cloudflare Worker  ──── Tavily Web Search API
      │
      ├── AIManager ──── OpenRouter (free models, key 1)
      │                ──── OpenRouter (free models, key 2)
      │                ──── Gemini API (fallback)
      │
      └── returns VerifyResult → Browser stores in sessionStorage
```

---

## Frontend Architecture

```
src/
├── constants/       Single source of truth for all magic strings
├── types/           Shared TypeScript interfaces (used by worker too)
├── hooks/           React Query mutations and custom hooks
├── services/        HTTP client (api.ts) and domain services (historyService.ts)
├── utils/           Pure functions shared across pages
├── lib/             Third-party wrappers (cn, credibility scoring)
├── providers/       React context providers (QueryProvider)
├── router/          React Router v7 configuration with lazy loading
├── layouts/         RootLayout shell (Navbar + Footer + Outlet)
├── components/
│   ├── layout/      Navbar, Footer, MobileBottomNav
│   ├── shared/      PageContainer, VerdictBadge, PageLoader
│   └── ui/          shadcn/ui primitives (Button, Card, Tabs, etc.)
└── pages/           One file per route
```

### Data Flow (Verify Request)

```
VerifyPage
  → useVerify() mutation
    → verifyClaim() in api.ts
      → POST /api/verify (Worker)
        → searchWeb() (Tavily)
        → analyseEvidence() (AIManager → OpenRouter/Gemini)
        → returns VerifyResult
  → sessionStorage.setItem(RESULT_STORAGE_KEY, result)
  → appendToHistory(result)
  → navigate("/result")

ResultPage
  → reads sessionStorage on mount
  → renders VerifyResult
```

---

## Worker Architecture

```
worker/
├── index.ts          Entry point, routing table, Env interface
├── routes/
│   ├── verify.ts     POST /api/verify
│   ├── search.ts     GET  /api/search
│   └── analyzeImage.ts  POST /api/analyze-image
├── services/
│   ├── gemini.ts     Fact-checking pipeline (analyseEvidence)
│   ├── credibility.ts  Source scoring (no AI, pure logic)
│   ├── tavily.ts     Web search wrapper
│   ├── ImageAnalyser.ts  Vision pipeline
│   ├── EvidenceExtractor.ts  (future: per-article extraction)
│   ├── EvidenceMerger.ts     (future: backend clustering)
│   └── PromptBuilder.ts      (future: token-budget prompts)
├── ai/
│   ├── AIManager.ts  Central orchestrator — health, retry, fallback
│   ├── config/
│   │   └── models.ts  Per-task model priority lists
│   ├── providers/
│   │   ├── BaseProvider.ts
│   │   ├── OpenRouterProvider.ts
│   │   ├── GeminiProvider.ts
│   │   ├── VisionProvider.ts (interface)
│   │   ├── OpenRouterVisionProvider.ts
│   │   └── GeminiVisionProvider.ts
│   └── types/
│       └── index.ts  AIRequest, AIResponse, ModelHealth, AITask
└── utils/
    ├── hostname.ts   Shared URL hostname extraction
    └── json.ts       Robust JSON extraction from AI responses
```

### AI Provider Priority

```
VERDICT task (per request):
  1. OpenRouter key 1 → google/gemma-4-26b-a4b-it:free
  2. OpenRouter key 1 → google/gemma-4-31b-it:free
  3. OpenRouter key 1 → deepseek/deepseek-chat:free
  ... (all models with key 1)
  then repeats with key 2 for each model
  finally falls back to Gemini direct API
```

### AIManager Health Tracking

- Singleton per Worker isolate — health state persists across requests
- Quota errors (429, "afford", "credits") → immediate 5-minute cooldown
- Other errors → cooldown after 3 failures with >50% failure rate
- Cooldown expires automatically — model re-enabled after cooldown period

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| sessionStorage for results | Avoids URL size limits; no backend auth needed |
| 1 AI call per verify | Free tier rate limits — multi-call pipeline preserved for future paid quota |
| Singleton AIManager | Health/cooldown state must persist across requests in same isolate |
| Constants file | Single source of truth prevents magic string duplication |
| No global state (Zustand/Redux) | TanStack Query + sessionStorage sufficient for current scope |
| Lazy-loaded pages | Reduces initial bundle; each page is a separate chunk |
