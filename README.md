# Teka Muna — AI Fact-Checker

> **Bago maniwala, Teka Muna.**
> An AI-powered fact-checking platform built for every Filipino.

Teka Muna helps Filipinos verify claims, news headlines, viral posts, and screenshots using AI-driven evidence analysis from hundreds of credible sources.

---

## Features

- **AI Verdict** — Fact-checks any claim with a `true / false / misleading / unverified` verdict and a confidence score
- **Evidence-First Pipeline** — Verdict determined by evidence, not source reputation; credibility only weights confidence
- **Multi-Model Fallback** — Automatically switches AI models (OpenRouter free tier → Gemini) on rate limits or failures
- **Source Comparison** — Side-by-side comparison of all sources with credibility scores and stance detection
- **Verification History** — Searchable, filterable history of all past fact-checks stored in session
- **Image Upload** *(Beta)* — Upload screenshots or photos for AI claim extraction
- **Filipino-First** — UI and AI responses in Filipino/Taglish

---

## Screenshots

| Home | Verify | Result |
|------|--------|--------|
| *(hero section)* | *(claim input form)* | *(verdict + sources)* |

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool and dev server |
| TailwindCSS v4 | Styling |
| React Router v7 | Client-side routing with lazy loading |
| TanStack Query v5 | Async state management |
| shadcn/ui | Accessible UI primitives |

### Backend
| Technology | Purpose |
|------------|---------|
| Cloudflare Workers | Serverless backend runtime |
| Cloudflare Pages | Static site hosting + Worker deployment |
| Tavily API | Web search for evidence gathering |
| OpenRouter | Access to free AI models (Gemma, DeepSeek, Qwen) |
| Google Gemini API | Direct AI fallback |

---

## Architecture Overview

```
Browser (React SPA)
      │  /api/*
      ▼
Cloudflare Worker
      ├── Tavily Search API  →  up to 10 sources
      └── AIManager
            ├── OpenRouter key 1  (free models)
            ├── OpenRouter key 2  (fallback key)
            └── Gemini API        (final fallback)
```

The Worker uses an **evidence-first** approach: all sources are passed to the AI regardless of credibility. Source credibility scores influence AI confidence weighting, never the verdict itself.

Full architecture details: [`docs/Architecture.md`](docs/Architecture.md)

---

## Installation

### Prerequisites

- Node.js 18+
- npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Setup

```bash
git clone https://github.com/your-username/teka-muna.git
cd teka-muna
npm install
cp .env.example .dev.vars
```

Edit `.dev.vars` with your API keys (see [Environment Variables](#environment-variables)).

---

## Running Locally

Two terminals required — the Worker and the frontend must both be running:

**Terminal 1 — Cloudflare Worker:**
```bash
npx wrangler dev --port 8787
```

**Terminal 2 — Vite dev server:**
```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api/*` to the Worker automatically.

---

## Building

```bash
npm run build
```

Output goes to `dist/`. Deploy with:

```bash
wrangler pages deploy dist
```

---

## Environment Variables

Set locally in `.dev.vars`. Set in production via `wrangler secret put <KEY>`.

| Variable | Required | Description |
|----------|----------|-------------|
| `TAVILY_API_KEY` | ✅ | [Tavily](https://tavily.com) web search API key |
| `OPENROUTER_API_KEY` | ✅ | [OpenRouter](https://openrouter.ai) API key (primary) |
| `OPENROUTER_API_KEY_2` | ❌ | Second OpenRouter key — auto-used when first is rate-limited |
| `GEMINI_API_KEY` | ❌ | [Google AI Studio](https://aistudio.google.com/apikey) Gemini API key |
| `MODELS_VERDICT` | ❌ | Override AI model priority for verdict task |
| `MODELS_EVIDENCE_EXTRACTION` | ❌ | Override AI model priority for extraction |
| `MODELS_SUMMARY` | ❌ | Override AI model priority for summarisation |
| `MODELS_SEARCH_QUERY` | ❌ | Override AI model priority for search query generation |
| `MODELS_TRANSLATION` | ❌ | Override AI model priority for translation |

**Model override format:** comma-separated OpenRouter model IDs in priority order.
```
MODELS_VERDICT=deepseek/deepseek-chat:free,qwen/qwen3-32b:free
```

---

## Folder Structure

```
teka-muna/
├── src/               React frontend
│   ├── constants/     App-wide constants (MASCOT_URL, storage keys, labels)
│   ├── types/         Shared TypeScript types
│   ├── hooks/         React Query hooks (useVerify)
│   ├── services/      HTTP client + domain services
│   ├── utils/         Pure utility functions
│   ├── lib/           Third-party wrappers (cn, credibility)
│   ├── components/    UI components (layout, shared, ui primitives)
│   ├── pages/         One file per route
│   └── router/        React Router configuration
├── worker/            Cloudflare Worker backend
│   ├── routes/        Route handlers
│   ├── services/      Business logic (AI pipeline, search, image)
│   ├── ai/            AI orchestration layer (AIManager, providers, config)
│   └── utils/         Pure worker utilities
├── docs/              Developer documentation
└── public/            Static assets
```

Full folder reference: [`docs/FolderStructure.md`](docs/FolderStructure.md)

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |
| `npx wrangler dev --port 8787` | Start Worker dev server |
| `npx wrangler pages deploy dist` | Deploy to Cloudflare Pages |

---

## Coding Conventions

- All constants in `src/constants/index.ts` — no magic strings elsewhere
- All API calls in `src/services/api.ts` — no fetch() in components
- All sessionStorage access via `src/services/historyService.ts`
- All AI calls through `worker/ai/AIManager.ts` — never directly to providers
- Every new file needs a JSDoc header (Purpose, Responsibilities, Dependencies)

Full guidelines: [`docs/CodingGuidelines.md`](docs/CodingGuidelines.md)

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/verify` | POST | Fact-check a claim |
| `/api/search` | GET | Raw web search results |
| `/api/analyze-image` | POST | Extract claim from image |
| `/api/health` | GET | Provider configuration status |

Full API docs: [`docs/API.md`](docs/API.md)

---

## Future Roadmap

- [ ] AI Vision — automatic claim extraction from uploaded images (infrastructure built, pending paid quota)
- [ ] Multi-phase evidence pipeline — per-article extraction + backend clustering (code preserved in `worker/services/`)
- [ ] Persistent history — migrate from sessionStorage to localStorage or user accounts
- [ ] PDF upload support
- [ ] Reverse image search integration
- [ ] EXIF metadata analysis
- [ ] Social media claim ingestion (Facebook, Twitter/X links)
- [ ] Claim sharing with verifiable permalink
- [ ] Admin dashboard for human fact-checker review

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow the [Coding Guidelines](docs/CodingGuidelines.md)
4. Commit with conventional commit messages: `feat: add ...`, `fix: ...`, `docs: ...`
5. Open a Pull Request against `main`

---

## License

ISC License — see [LICENSE](LICENSE) for details.

---

*Built for Every Juan · Developed by Hance Dagondon*
