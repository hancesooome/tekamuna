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
import { readFileSync } from "fs";
import { join } from "path";
import { decodeClaim, encodeClaim } from "../shared/shareUrl";

const CRAWLER_RE =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot/i;

const VERDICT_LABELS: Record<string, string> = {
  true:       "Totoo",
  false:      "Hindi Totoo",
  misleading: "Mapanlinlang",
  unverified: "Hindi Ma-verify",
};

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

/** Read the built SPA shell once and cache it. */
let _indexHtml: string | null = null;
function getSpaShell(): string {
  if (_indexHtml) return _indexHtml;
  // Vercel sets cwd to the project root; dist/index.html is the Vite build output.
  _indexHtml = readFileSync(join(process.cwd(), "dist", "index.html"), "utf-8");
  return _indexHtml;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const encoded = Array.isArray(req.query.c) ? req.query.c[0] : req.query.c ?? "";
  const ua = req.headers["user-agent"] ?? "";

  // Human browsers — serve the SPA shell directly.
  // A 301 redirect back to /check would re-trigger the vercel.json rewrite
  // (which routes /check → /api/check), creating an infinite redirect loop.
  if (!CRAWLER_RE.test(ua)) {
    try {
      const html = getSpaShell();
      res
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .setHeader("Cache-Control", "no-store")
        .status(200)
        .send(html);
    } catch {
      // dist/index.html not present (e.g. local dev without a build) — safe fallback
      res.redirect(302, encoded ? `/check?c=${encodeURIComponent(encoded)}` : "/");
    }
    return;
  }

  const claim = encoded ? decodeClaim(encoded) : null;

  // Crawler but no valid claim — serve SPA shell so the page still loads
  if (!claim) {
    try {
      res
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .setHeader("Cache-Control", "no-store")
        .status(200)
        .send(getSpaShell());
    } catch {
      res.redirect(302, "/");
    }
    return;
  }

  const origin = `https://${req.headers.host}`;
  const pageUrl = `${origin}/check?c=${encodeURIComponent(encoded)}`;

  // og:image: prefer the stored share-card PNG from the Worker
  const base = workerBase().startsWith("http")
    ? workerBase()
    : origin + "/api";
  const imageUrl = `${base}/og/image?c=${encodeURIComponent(encoded)}`;

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
