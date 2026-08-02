/**
 * worker/routes/og.ts
 *
 * Open Graph support for social link previews.
 *
 *   POST /api/og/store   — store a client-generated share-card PNG
 *   GET  /api/og/image   — serve the stored PNG for og:image
 *   GET  /api/og/preview — HTML page with OG meta tags (for crawlers)
 */

import type { Env } from "../index";
import { decodeClaim } from "../../shared/shareUrl";
import { getCachedClaim, normalizeClaim } from "../services/cache";

const BUCKET = "template-assets";
const SHARE_FOLDER = "share-cards";

const VERDICT_LABELS: Record<string, string> = {
  true:       "Totoo",
  false:      "Hindi Totoo",
  misleading: "Mapanlinlang",
  unverified: "Hindi Ma-verify",
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function shareCardPath(encodedClaim: string): string {
  return `${SHARE_FOLDER}/${encodedClaim}.png`;
}

function publicStorageUrl(env: Env, path: string): string | null {
  if (!env.SUPABASE_URL) return null;
  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function fetchStoredImage(env: Env, encodedClaim: string): Promise<Response | null> {
  const url = publicStorageUrl(env, shareCardPath(encodedClaim));
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type":                "image/png",
        "Cache-Control":               "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return null;
  }
}

/** Minimal fallback SVG when no stored card exists yet. */
function fallbackSvg(claim: string, verdictLabel?: string): Response {
  const title = truncate(claim, 120);
  const badge = verdictLabel ?? "Teka Muna";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="60" y="80" fill="#ffffff" font-family="system-ui,sans-serif" font-size="28" font-weight="900">TEKA MUNA</text>
  <rect x="60" y="110" rx="24" ry="24" width="280" height="52" fill="#10b981"/>
  <text x="200" y="143" fill="#ffffff" font-family="system-ui,sans-serif" font-size="22" font-weight="800" text-anchor="middle">${escapeHtml(badge)}</text>
  <rect x="60" y="190" rx="16" ry="16" width="1080" height="320" fill="rgba(255,255,255,0.95)"/>
  <foreignObject x="80" y="210" width="1040" height="280">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:system-ui,sans-serif;font-size:26px;font-weight:700;color:#0f172a;line-height:1.4;">
      ${escapeHtml(title)}
    </div>
  </foreignObject>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type":                "image/svg+xml",
      "Cache-Control":               "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function buildOgMeta(env: Env, encodedClaim: string, origin: string) {
  const claim = decodeClaim(encodedClaim);
  if (!claim) return null;

  let description = "AI-powered Filipino fact-checking — bago maniwala, Teka Muna.";
  let verdictLabel: string | undefined;

  const cached = await getCachedClaim(env, normalizeClaim(claim));
  if (cached) {
    verdictLabel = VERDICT_LABELS[cached.verdict] ?? cached.verdict;
    description = `${verdictLabel}: ${truncate(cached.summary || claim, 180)}`;
  }

  const pageUrl = `${origin}/check?c=${encodedClaim}`;
  const imageUrl = `${origin}/api/og/image?c=${encodeURIComponent(encodedClaim)}`;

  return {
    claim,
    title: claim,
    description,
    pageUrl,
    imageUrl,
    siteName: "Teka Muna",
    verdictLabel,
  };
}

function ogHtml(meta: {
  claim: string;
  title: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
  siteName: string;
}): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const u = escapeHtml(meta.pageUrl);
  const img = escapeHtml(meta.imageUrl);
  const site = escapeHtml(meta.siteName);

  return `<!doctype html>
<html lang="fil">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${site}" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${u}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1080" />
  <meta property="og:image:height" content="1080" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
  <meta http-equiv="refresh" content="0;url=${u}" />
</head>
<body>
  <p><a href="${u}">${t}</a></p>
</body>
</html>`;
}

export async function handleOgStore(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Storage not configured." }, 503);
  }

  let body: { c?: string; image?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const { c, image } = body;
  if (!c || !image || typeof c !== "string" || typeof image !== "string") {
    return json({ error: "Body must include { c, image }." }, 422);
  }

  const claim = decodeClaim(c);
  if (!claim) return json({ error: "Invalid claim token." }, 422);

  const match = image.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return json({ error: "Image must be a PNG data URL." }, 422);

  let bytes: Uint8Array;
  try {
    const bin = atob(match[1]);
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return json({ error: "Invalid base64 image data." }, 422);
  }

  if (bytes.byteLength > 5 * 1024 * 1024) {
    return json({ error: "Image too large (max 5 MB)." }, 422);
  }

  const path = shareCardPath(c);
  const storageUrl = `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

  const uploadRes = await fetch(storageUrl, {
    method:  "POST",
    headers: {
      "apikey":        env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type":  "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert":      "true",
    },
    body: bytes,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text();
    return json({ error: `Upload failed: ${detail}` }, 502);
  }

  const publicUrl = publicStorageUrl(env, path);
  return json({ ok: true, path, url: publicUrl }, 201);
}

export async function handleOgImage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const encoded = url.searchParams.get("c");
  if (!encoded) return json({ error: "Missing ?c= parameter." }, 400);

  const claim = decodeClaim(encoded);
  if (!claim) return json({ error: "Invalid claim token." }, 400);

  const stored = await fetchStoredImage(env, encoded);
  if (stored) return stored;

  let verdictLabel: string | undefined;
  const cached = await getCachedClaim(env, normalizeClaim(claim));
  if (cached) verdictLabel = VERDICT_LABELS[cached.verdict] ?? cached.verdict;

  return fallbackSvg(claim, verdictLabel);
}

export async function handleOgPreview(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const encoded = url.searchParams.get("c");
  if (!encoded) return json({ error: "Missing ?c= parameter." }, 400);

  const origin = url.searchParams.get("origin") || `${url.protocol}//${url.host}`;
  const meta = await buildOgMeta(env, encoded, origin);
  if (!meta) return json({ error: "Invalid claim token." }, 400);

  return new Response(ogHtml(meta), {
    status: 200,
    headers: {
      "Content-Type":  "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}

export function isSocialCrawler(userAgent: string): boolean {
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot/i.test(userAgent);
}
