# Teka Muna — Folder Structure

```
teka-muna/
│
├── src/                          Frontend (React + TypeScript + Vite)
│   ├── constants/
│   │   └── index.ts              All app constants (MASCOT_URL, storage keys, labels)
│   ├── types/
│   │   ├── index.ts              Re-export barrel
│   │   └── verify.ts             Shared domain types (Verdict, VerifyResult, Source, etc.)
│   ├── hooks/
│   │   └── useVerify.ts          TanStack Query mutation for fact-checking
│   ├── services/
│   │   ├── api.ts                HTTP client — all fetch() calls live here
│   │   ├── historyService.ts     sessionStorage read/write for history
│   │   └── index.ts              Re-export barrel
│   ├── utils/
│   │   └── sources.ts            Pure utils: stanceOf, allSourcesMerged, formatDate, extractKeyFacts
│   ├── lib/
│   │   ├── utils.ts              Tailwind class merge utility (cn)
│   │   └── credibility.ts        Frontend credibility scoring (display only)
│   ├── providers/
│   │   └── QueryProvider.tsx     TanStack Query client + DevTools
│   ├── router/
│   │   └── index.tsx             React Router v7 config with lazy-loaded pages
│   ├── layouts/
│   │   └── RootLayout.tsx        Shell: Navbar + <Outlet /> + Footer + MobileBottomNav
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── MobileBottomNav.tsx
│   │   ├── shared/
│   │   │   ├── PageContainer.tsx
│   │   │   ├── PageLoader.tsx
│   │   │   └── VerdictBadge.tsx
│   │   └── ui/                   shadcn/ui primitives (do not modify)
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── VerifyPage.tsx
│   │   ├── ResultPage.tsx
│   │   ├── SourceComparisonPage.tsx
│   │   ├── HistoryPage.tsx
│   │   └── AboutPage.tsx
│   ├── main.tsx                  App entry point
│   └── index.css                 Global styles + Tailwind + design tokens
│
├── worker/                       Backend (Cloudflare Worker)
│   ├── index.ts                  Entry point, routing table, Env interface
│   ├── routes/
│   │   ├── verify.ts             POST /api/verify
│   │   ├── search.ts             GET  /api/search
│   │   └── analyzeImage.ts       POST /api/analyze-image
│   ├── services/
│   │   ├── gemini.ts             Fact-check pipeline (analyseEvidence)
│   │   ├── credibility.ts        Source scoring + AI prompt rules
│   │   ├── tavily.ts             Tavily web search wrapper
│   │   ├── ImageAnalyser.ts      Vision AI pipeline
│   │   ├── EvidenceExtractor.ts  (future) Per-article AI extraction
│   │   ├── EvidenceMerger.ts     (future) Backend evidence clustering
│   │   └── PromptBuilder.ts      (future) Token-budget prompt builder
│   ├── ai/
│   │   ├── AIManager.ts          Central AI orchestrator
│   │   ├── config/
│   │   │   └── models.ts         Per-task model priority lists
│   │   ├── providers/
│   │   │   ├── BaseProvider.ts
│   │   │   ├── OpenRouterProvider.ts
│   │   │   ├── GeminiProvider.ts
│   │   │   ├── VisionProvider.ts
│   │   │   ├── OpenRouterVisionProvider.ts
│   │   │   └── GeminiVisionProvider.ts
│   │   └── types/
│   │       └── index.ts          AIRequest, AIResponse, ModelHealth, AITask
│   └── utils/
│       ├── hostname.ts           URL hostname extraction
│       └── json.ts               Robust JSON extraction from AI responses
│
├── docs/                         Developer documentation
│   ├── Architecture.md
│   ├── API.md
│   ├── Components.md
│   ├── CodingGuidelines.md
│   ├── Deployment.md
│   ├── FolderStructure.md  ← you are here
│   ├── Hooks.md
│   └── Services.md
│
├── .dev.vars                     Local secrets (never commit)
├── .env.example                  Template for .dev.vars
├── index.html                    Vite entry HTML
├── wrangler.toml                 Cloudflare Worker config
├── vite.config.ts                Vite build config
├── tsconfig.json                 TypeScript config
├── tailwind.config.js            (implicit via @tailwindcss/vite)
├── components.json               shadcn/ui config
└── README.md                     Project overview
```
