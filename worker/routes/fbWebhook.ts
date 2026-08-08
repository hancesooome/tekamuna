/**
 * worker/routes/fbWebhook.ts
 *
 * Facebook Webhook handler for Teka Muna
 *
 * Endpoints:
 *   GET  /api/fb-webhook  — Facebook verification handshake
 *   POST /api/fb-webhook  — Incoming webhook events (page mentions, feed posts)
 *
 * How it works:
 *   1. When someone tags the Teka Muna FB Page, Facebook sends a POST event here
 *   2. We extract the post text from the event payload
 *   3. We call the existing /api/verify pipeline (re-using handleVerify logic)
 *   4. We format and post a reply comment on the original post via Graph API
 *
 * Required env vars (add to .dev.vars and wrangler secrets):
 *   FB_VERIFY_TOKEN      — the secret token you set in the Facebook Webhooks dashboard
 *   FB_PAGE_ACCESS_TOKEN — long-lived Page Access Token from Graph API Explorer
 *   FB_APP_SECRET        — App Secret from App Settings → Basic (for signature verification)
 */

import type { Env } from "../index";
import { searchWeb } from "../services/tavily";
import { analyseEvidence, type AnalysisResult } from "../services/gemini";
import { shouldRunVerificationPipeline } from "../../src/utils/intent";
import { fetchAdminSettings } from "../lib/adminSettings";
import {
  normalizeClaim,
  getCachedClaim,
  saveCachedClaim,
  calculateExpiration,
} from "../services/cache";

// ── Pipeline version (keep in sync with verify.ts) ───────────────────────────
const CURRENT_PIPELINE_VERSION = 1;

// ── Verdict emoji map ─────────────────────────────────────────────────────────
const VERDICT_EMOJI: Record<string, string> = {
  true:        "✅",
  false:       "❌",
  misleading:  "⚠️",
  unverified:  "❓",
};

const VERDICT_LABEL: Record<string, string> = {
  true:       "TOTOO (True)",
  false:      "HINDI TOTOO (False)",
  misleading: "MAPANLINLANG (Misleading)",
  unverified: "HINDI MA-VERIFY (Unverified)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verify that the incoming POST actually came from Facebook.
 * Facebook signs every webhook payload with your App Secret using HMAC-SHA256.
 * We compute the expected signature and compare it to the X-Hub-Signature-256 header.
 */
async function verifyFacebookSignature(
  request: Request,
  rawBody: string,
  appSecret: string,
): Promise<boolean> {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `sha256=${hex}`;

  // Constant-time comparison to prevent timing attacks
  return signature === expected;
}

/**
 * Extract the text claim from a Facebook webhook event payload.
 * Handles both "mention" events and "feed" post events.
 */
function extractClaim(entry: Record<string, unknown>): string | null {
  // Try mention events first (page tagged in someone else's post)
  const changes = entry.changes as Array<{ field: string; value: Record<string, unknown> }> | undefined;
  if (changes) {
    for (const change of changes) {
      if (change.field === "mention" || change.field === "feed") {
        const value = change.value;
        // "message" is the post text in feed events
        if (typeof value.message === "string" && value.message.trim().length > 10) {
          return value.message.trim();
        }
        // "item" + "message" for comment events
        if (typeof value.item === "string" && typeof value.message === "string") {
          return value.message.trim();
        }
      }
    }
  }
  return null;
}

/**
 * Extract the post/comment ID to reply to.
 */
function extractPostId(entry: Record<string, unknown>): string | null {
  const changes = entry.changes as Array<{ field: string; value: Record<string, unknown> }> | undefined;
  if (changes) {
    for (const change of changes) {
      const value = change.value;
      // Comment ID for mention events
      if (typeof value.comment_id === "string") return value.comment_id;
      // Post ID for feed events
      if (typeof value.post_id === "string") return value.post_id;
    }
  }
  return null;
}

/**
 * Post a comment reply on a Facebook post/comment using the Graph API.
 */
async function postFacebookReply(
  postId: string,
  message: string,
  pageAccessToken: string,
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${postId}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[fbWebhook] Failed to post reply:", err);
  } else {
    console.log("[fbWebhook] Reply posted to:", postId);
  }
}

/**
 * Format the fact-check result into a clean Facebook comment.
 */
function formatReply(claim: string, result: AnalysisResult): string {
  const verdict = result.verdict?.toLowerCase() ?? "unverified";
  const emoji = VERDICT_EMOJI[verdict] ?? "❓";
  const label = VERDICT_LABEL[verdict] ?? "HINDI MA-VERIFY";
  const confidence = Math.round((result.confidence ?? 0) * 100);

  // Pick top 3 reliable sources
  const sources = (result.reliableSources ?? [])
    .slice(0, 3)
    .map((s, i) => `${i + 1}. ${s.title ?? s.url ?? "Source"}${s.url ? ` — ${s.url}` : ""}`)
    .join("\n");

  const explanation = result.explanation
    ? result.explanation.slice(0, 300) + (result.explanation.length > 300 ? "..." : "")
    : "";

  return [
    `🔍 TEKA MUNA FACT CHECK`,
    ``,
    `${emoji} HATOL: ${label}`,
    `📊 Kumpiyansa: ${confidence}%`,
    ``,
    explanation ? `📝 ${explanation}` : "",
    ``,
    sources ? `📚 Mga Pinagkukunan:\n${sources}` : "",
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `I-check ang buong resulta sa: https://www.tekamuna.app`,
    `#TekaMuna #FactCheck #Katotohanan`,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
}

// ── GET /api/fb-webhook — Facebook verification handshake ─────────────────────
// When you first configure the webhook in the FB dashboard, Facebook sends a
// GET request with hub.challenge. We must echo it back to prove we own the URL.
export async function handleFbWebhookVerify(
  request: Request,
  env: Env & { FB_VERIFY_TOKEN?: string },
): Promise<Response> {
  const url = new URL(request.url);
  const mode      = url.searchParams.get("hub.mode");
  const token     = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = env.FB_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[fbWebhook] FB_VERIFY_TOKEN not configured");
    return new Response("Server misconfiguration", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[fbWebhook] Webhook verified by Facebook ✅");
    // Return ONLY the challenge string — Facebook checks for exact match
    return new Response(challenge, { status: 200 });
  }

  console.warn("[fbWebhook] Verification failed — token mismatch");
  return new Response("Verification failed", { status: 403 });
}

// ── POST /api/fb-webhook — Incoming events ────────────────────────────────────
export async function handleFbWebhookEvent(
  request: Request,
  env: Env & {
    FB_VERIFY_TOKEN?: string;
    FB_PAGE_ACCESS_TOKEN?: string;
    FB_APP_SECRET?: string;
  },
  ctx: ExecutionContext,
): Promise<Response> {
  // ── 1. Read raw body (needed for signature verification) ─────────────────
  const rawBody = await request.text();

  // ── 2. Verify signature (security — reject fake requests) ─────────────────
  if (env.FB_APP_SECRET) {
    const valid = await verifyFacebookSignature(request, rawBody, env.FB_APP_SECRET);
    if (!valid) {
      console.warn("[fbWebhook] Invalid signature — rejecting request");
      return new Response("Invalid signature", { status: 403 });
    }
  } else {
    console.warn("[fbWebhook] FB_APP_SECRET not set — skipping signature check (unsafe!)");
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────────
  let payload: { object?: string; entry?: Array<Record<string, unknown>> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Facebook always sends { "object": "page", "entry": [...] } for Page events
  if (payload.object !== "page" || !Array.isArray(payload.entry)) {
    // Return 200 anyway — Facebook expects 200 or it will retry repeatedly
    return new Response("OK", { status: 200 });
  }

  // ── 4. Process each entry asynchronously (don't block the response) ───────
  // Facebook requires a 200 response within 20 seconds or it marks delivery failed.
  // We respond immediately and do the heavy work in ctx.waitUntil.
  const pageAccessToken = env.FB_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    console.error("[fbWebhook] FB_PAGE_ACCESS_TOKEN not configured");
    return new Response("OK", { status: 200 }); // Still 200 to avoid FB retries
  }

  const adminSettings = await fetchAdminSettings(env);

  ctx.waitUntil(
    (async () => {
      for (const entry of payload.entry ?? []) {
        const claim  = extractClaim(entry);
        const postId = extractPostId(entry);

        if (!claim || !postId) {
          console.log("[fbWebhook] Skipping entry — no claim or postId found");
          continue;
        }

        console.log(`[fbWebhook] Processing claim: "${claim.slice(0, 80)}..."`);

        // ── Intent check ────────────────────────────────────────────────────
        const detection = shouldRunVerificationPipeline(claim);
        if (!detection.shouldVerify) {
          console.log(`[fbWebhook] Claim not fact-checkable: ${detection.reason}`);
          // Optionally post a "we can't fact-check this" reply
          await postFacebookReply(
            postId,
            `🤖 Teka Muna: Ang mensaheng ito ay mukhang hindi angkop para sa fact-checking. Subukan ang mga factual na claim sa https://www.tekamuna.app`,
            pageAccessToken,
          );
          continue;
        }

        // ── Check cache first ────────────────────────────────────────────────
        const normalizedClaim = normalizeClaim(claim);
        const cacheEntry = await getCachedClaim(env, normalizedClaim);
        if (cacheEntry) {
          const isFresh = new Date(cacheEntry.expires_at) > new Date()
            && cacheEntry.pipeline_version === CURRENT_PIPELINE_VERSION;
          if (isFresh) {
            console.log("[fbWebhook] Cache HIT — using cached result");
            const cachedResult = {
              verdict:         cacheEntry.verdict,
              confidence:      cacheEntry.confidence,
              explanation:     cacheEntry.summary,
              reliableSources: cacheEntry.sources?.reliableSources ?? [],
            } as unknown as AnalysisResult;
            const reply = formatReply(claim, cachedResult);
            await postFacebookReply(postId, reply, pageAccessToken);
            continue;
          }
        }

        // ── Run full pipeline ────────────────────────────────────────────────
        try {
          const searchResults = await searchWeb(
            claim,
            env.TAVILY_API_KEY,
            env.TAVILY_API_KEY_2,
            adminSettings.tavilyMode,
          );

          const rawResult = await analyseEvidence({
            claim,
            searchResults,
            geminiApiKey:      env.GEMINI_API_KEY,
            openRouterApiKey:  env.OPENROUTER_API_KEY,
            openRouterApiKey2: env.OPENROUTER_API_KEY_2,
            envVars:           env as unknown as Record<string, string | undefined>,
            aiProviderMode:    adminSettings.aiProviderMode,
          }) as AnalysisResult;

          // Cache result
          if (rawResult._persist !== false) {
            const cacheCategory = rawResult.category ?? "evergreen";
            await saveCachedClaim(env, {
              claimOriginal:   claim,
              claimNormalized: normalizedClaim,
              category:        cacheCategory,
              verdict:         rawResult.verdict,
              confidence:      rawResult.confidence,
              summary:         rawResult.explanation,
              reasoning:       rawResult.truthStatement,
              sources: {
                supportingEvidence:    rawResult.supportingEvidence,
                contradictingEvidence: rawResult.contradictingEvidence,
                reliableSources:       rawResult.reliableSources,
                mascotAdvice:          rawResult.mascotAdvice,
                searchResultsCount:    rawResult.searchResultsCount,
              },
              searchProvider:  adminSettings.tavilyMode,
              aiModel:         rawResult._aiModelUsed ?? "unknown",
              pipelineVersion: CURRENT_PIPELINE_VERSION,
            });
          }

          // Format and post reply
          const reply = formatReply(claim, rawResult);
          await postFacebookReply(postId, reply, pageAccessToken);

        } catch (err) {
          console.error("[fbWebhook] Pipeline error:", err);
          await postFacebookReply(
            postId,
            `🤖 Teka Muna: May nangyaring error habang sinusuri ang claim. Subukan muli sa https://www.tekamuna.app`,
            pageAccessToken,
          );
        }
      }
    })(),
  );

  // ── 5. Respond immediately — Facebook needs 200 within 20s ───────────────
  return new Response("OK", { status: 200 });
}
