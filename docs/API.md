# Teka Muna — API Reference

All endpoints are served by the Cloudflare Worker at `/api/*`.

In development: Vite proxies `/api` → `localhost:8787` (wrangler dev).
In production: the Worker is colocated with the Pages site on the same domain.

---

## POST /api/verify

Verifies a factual claim by searching the web and analysing sources with AI.

### Request

```json
{
  "claim": "Libre ang tuition fee sa lahat ng state universities sa Pilipinas",
  "category": "Edukasyon"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| claim | string | ✅ | The claim to fact-check (5–1000 chars) |
| category | string | ❌ | Optional category hint for better search |

### Response

```json
{
  "claim": "...",
  "verdict": "true",
  "confidence": 85,
  "explanation": "...",
  "truthStatement": "...",
  "supportingEvidence": [{ "title": "", "url": "", "sourceName": "", "publishedDate": "", "summary": "" }],
  "contradictingEvidence": [],
  "reliableSources": [],
  "mascotAdvice": "...",
  "searchResultsCount": 10,
  "verifiedAt": "2026-07-26T10:00:00.000Z"
}
```

### Verdict Values

| Value | Meaning |
|-------|---------|
| `true` | Evidence supports the claim |
| `false` | Evidence contradicts the claim |
| `misleading` | Partially true, exaggerated, or missing context |
| `unverified` | Insufficient or contradictory evidence |

### Error Responses

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Invalid JSON body." }` | Malformed request |
| 422 | `{ "error": "Field claim is required..." }` | Missing or too-short claim |
| 422 | `{ "error": "Field claim must not exceed 1000 characters." }` | Claim too long |

---

## GET /api/search

Returns raw Tavily web search results for a query. Useful for debugging.

### Request

```
GET /api/search?q=Libre+ang+tuition+fee
```

### Response

```json
{
  "query": "Libre ang tuition fee",
  "results": [
    {
      "title": "...",
      "url": "...",
      "content": "...",
      "score": 0.92,
      "publishedDate": "2026-07-01",
      "rawContent": null
    }
  ],
  "totalResults": 10,
  "searchedAt": "2026-07-26T10:00:00.000Z"
}
```

---

## POST /api/analyze-image

Analyses an uploaded image and extracts the factual claim it contains.

> **Note:** AI Vision is currently in Beta. The endpoint is active but may return `success: false` when free-tier vision model quota is exhausted.

### Request

`multipart/form-data` with field `image` containing the image file.

| Constraint | Value |
|------------|-------|
| Formats | JPG, JPEG, PNG, WebP |
| Max size | 10 MB |
| Files | Single file only |

### Response

```json
{
  "success": true,
  "claim": "The image claims that electricity will become free starting in August.",
  "confidence": 94,
  "ocrText": "Libre na ang kuryente simula August.",
  "language": "Filipino"
}
```

On failure:

```json
{
  "success": false,
  "claim": "",
  "confidence": 0,
  "ocrText": "",
  "language": "Unknown",
  "error": "Unable to analyze the image. Please enter the claim manually."
}
```

### Error Responses (before AI call)

| Status | Code | Cause |
|--------|------|-------|
| 422 | `UNSUPPORTED_FORMAT` | Non-image file type |
| 422 | `FILE_TOO_LARGE` | File exceeds 10 MB |
| 422 | `NO_IMAGE` | No file in form data |

---

## GET /api/health

Liveness check. Returns provider configuration status.

### Response

```json
{
  "ok": true,
  "ts": 1785045777040,
  "services": {
    "tavily": "configured",
    "openrouter": "configured",
    "openrouter2": "configured",
    "gemini": "configured"
  },
  "modelOverrides": {
    "VERDICT": "(default)",
    "EVIDENCE_EXTRACTION": "(default)",
    "SUMMARY": "(default)",
    "SEARCH_QUERY": "(default)",
    "TRANSLATION": "(default)"
  }
}
```
