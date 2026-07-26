# Teka Muna — Deployment

## Overview

Teka Muna is deployed on **Cloudflare Pages** with a **Cloudflare Worker** backend.

- Frontend: static React SPA built by Vite → served from Cloudflare Pages
- Backend: Cloudflare Worker colocated on the same domain under `/api/*`

---

## Local Development

### Prerequisites

- Node.js 18+
- npm
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
git clone <repo>
cd teka-nga-v2
npm install
cp .env.example .dev.vars   # fill in your API keys
```

### Run (two terminals)

**Terminal 1 — Worker:**
```bash
npx wrangler dev --port 8787
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to `localhost:8787`.

---

## Environment Variables

Set locally in `.dev.vars`. Set in production via `wrangler secret put`.

| Variable | Required | Description |
|----------|----------|-------------|
| `TAVILY_API_KEY` | ✅ | Tavily web search API key |
| `OPENROUTER_API_KEY` | ✅ | Primary OpenRouter key (free tier) |
| `OPENROUTER_API_KEY_2` | ❌ | Secondary OpenRouter key — used when first is rate-limited |
| `GEMINI_API_KEY` | ❌ | Direct Gemini API key — final AI fallback |
| `MODELS_VERDICT` | ❌ | Override model priority for VERDICT task |
| `MODELS_EVIDENCE_EXTRACTION` | ❌ | Override model priority for extraction |
| `MODELS_SUMMARY` | ❌ | Override model priority for summary |
| `MODELS_SEARCH_QUERY` | ❌ | Override model priority for search queries |
| `MODELS_TRANSLATION` | ❌ | Override model priority for translation |

**Model override format:** comma-separated OpenRouter model IDs in priority order.
```
MODELS_VERDICT=deepseek/deepseek-chat:free,qwen/qwen3-32b:free
```

---

## Production Deployment

### Set secrets

```bash
wrangler secret put TAVILY_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put OPENROUTER_API_KEY_2
wrangler secret put GEMINI_API_KEY
```

### Deploy

Cloudflare Pages deploys automatically on push to `main`. The Worker is bundled as part of the Pages Functions deployment.

Manual deploy:
```bash
npm run build
wrangler pages deploy dist
```

---

## Build

```bash
npm run build
```

Output in `dist/`. The Worker is compiled separately by Wrangler.

---

## Health Check

```bash
curl https://your-domain.pages.dev/api/health
```

Expected response:
```json
{
  "ok": true,
  "services": {
    "tavily": "configured",
    "openrouter": "configured",
    "openrouter2": "configured",
    "gemini": "configured"
  }
}
```
