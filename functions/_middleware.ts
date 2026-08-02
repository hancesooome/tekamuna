/**
 * Cloudflare Pages middleware — dynamic OG HTML for social crawlers on /check.
 */

import { decodeClaim } from "../shared/shareUrl";

const CRAWLER_RE =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest/i;

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

function buildOgHtml(opts: {
  title: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
}): string {
  const t = escapeHtml(opts.title);
  const d = escapeHtml(opts.description);
  const u = escapeHtml(opts.pageUrl);
  const img = escapeHtml(opts.imageUrl);

  return `<!doctype html>
<html lang="fil">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>
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

export async function onRequest(context: EventContext<unknown, string, unknown>) {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") ?? "";

  if (url.pathname !== "/check" || !CRAWLER_RE.test(ua)) {
    return next();
  }

  const encoded = url.searchParams.get("c");
  if (!encoded) return next();

  const claim = decodeClaim(encoded);
  if (!claim) return next();

  const origin = url.origin;
  const pageUrl = `${origin}/check?c=${encoded}`;
  const imageUrl = `${origin}/api/og/image?c=${encodeURIComponent(encoded)}`;

  return new Response(
    buildOgHtml({
      title: claim,
      description: truncate(claim, 200),
      pageUrl,
      imageUrl,
    }),
    {
      status: 200,
      headers: {
        "Content-Type":  "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    },
  );
}
