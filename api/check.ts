/**
 * api/check.ts — Vercel Serverless Function
 *
 * Handles GET /check?c=<encoded-claim>
 *
 * - Social crawlers (Facebook, Twitter, WhatsApp, etc.):
 *     Returns a minimal HTML page with full Open Graph meta tags.
 *     og:image points to the stored share-card PNG via the Worker.
 *
 * - Human browsers:
 *     Serves the SPA index.html directly (avoids a redirect loop since
 *     vercel.json rewrites /check → /api/check for ALL requests).
 *
 * Why a serverless function instead of middleware.ts?
 *   Vercel Edge Middleware only runs for Next.js projects.
 *   For plain Vite SPAs, api/* functions are the correct mechanism.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Base64url → UTF-8 string, returns null on failure. */
function decodeClaim(encoded: string): string | null {
  try {
    const base64 = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
    const bin = atob(base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    if (!decoded || decoded.trim().length === 0 || decoded.length > 1000) return null;
    return decoded.trim();
  } catch {
    return null;
  }
}

/** UTF-8 string → Base64url. */
function encodeClaim(claim: string): string {
  const bytes = new TextEncoder().encode(claim);
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const CRAWLER_RE =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot/i;

const VERDICT_LABELS: Record<string, string> = {
  true:       "Totoo",
  false:      "Hindi Totoo",
  misleading: "Mapanlinlang",
  unverified: "Hindi Ma-verify",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function workerBase(): string {
  // WORKER_API_BASE is set in Vercel project env vars to the Worker URL.
  // Falls back to same-origin /api (works if Worker is bound to the same domain).
  const base = process.env.WORKER_API_BASE ?? process.env.VITE_API_BASE_URL ?? "";
  return base.replace(/\/$/, "") || "/api";
}

async function fetchVerdict(claim: string): Promise<{ verdict: string; summary: string } | null> {
  try {
    const base = workerBase();
    // Only attempt if we have an absolute Worker URL — relative URLs don't work server-side
    if (!base.startsWith("http")) return null;
    const encoded = encodeURIComponent(encodeClaim(claim));
    const res = await fetch(`${base}/og/preview?c=${encoded}`, {
      headers: { "User-Agent": "TekaMuna-OGBuilder/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    // The worker's og/preview returns HTML — parse the description meta tag
    const html = await res.text();
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    if (!desc) return null;
    // Format: "Verdiklabel: summary..."
    for (const [key, label] of Object.entries(VERDICT_LABELS)) {
      if (desc.startsWith(label + ":")) {
        return { verdict: key, summary: desc.slice(label.length + 1).trim() };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildOgHtml(opts: {
  claim: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
}): string {
  const t = escapeHtml(opts.claim);
  const d = escapeHtml(opts.description);
  const u = escapeHtml(opts.pageUrl);
  const img = escapeHtml(opts.imageUrl);

  return `<!doctype html>
<html lang="fil">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t} — Teka Muna</title>
  <meta name="description" content="${d}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Teka Muna" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${u}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
</head>
<body>
  <p><a href="${u}">${t}</a></p>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const encoded = Array.isArray(req.query.c) ? req.query.c[0] : req.query.c ?? "";
  const ua = req.headers["user-agent"] ?? "";

  // Human browsers — redirect to the real SPA check page.
  // /og/check is only meant for crawlers; humans should be on /check?c=...
  if (!CRAWLER_RE.test(ua)) {
    const dest = encoded ? `/check?c=${encodeURIComponent(encoded)}` : "/";
    res.redirect(302, dest);
    return;
  }

  const claim = encoded ? decodeClaim(encoded) : null;

  // Crawler but no valid claim — serve minimal OG fallback
  if (!claim) {
    res
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .status(200)
      .send(`<!doctype html><html><head><meta charset="UTF-8"/><meta property="og:site_name" content="Teka Muna"/><title>Teka Muna</title></head><body></body></html>`);
    return;
  }

  const origin = `https://${req.headers.host}`;
  // og:url points to the real SPA page (/check), not the OG endpoint (/og/check)
  const pageUrl = `${origin}/check?c=${encodeURIComponent(encoded)}`;

  // Use the static preview image — always absolute, always available.
  const imageUrl = `${origin}/preview-image.png`;

  // Try to get a richer description from the Worker cache
  const cached = await fetchVerdict(claim);
  const description = cached
    ? `${VERDICT_LABELS[cached.verdict]}: ${truncate(cached.summary || claim, 180)}`
    : truncate(claim, 200);

  res
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .setHeader("Cache-Control", "public, max-age=300, s-maxage=600")
    .status(200)
    .send(buildOgHtml({ claim, description, pageUrl, imageUrl }));
}
