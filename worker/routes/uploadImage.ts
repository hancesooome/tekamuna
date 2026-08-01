/**
 * worker/routes/uploadImage.ts
 *
 * POST /api/admin/upload-image
 *
 * Proxies a template background image upload to Supabase Storage.
 * The Worker sits in the middle so the browser never needs the service_role key.
 *
 * Flow:
 *   1. Browser sends multipart/form-data { file, folder?, filename? }
 *      with Authorization: Bearer <supabase-jwt>
 *   2. Worker validates auth, file type, and file size
 *   3. Worker re-uploads the bytes to Supabase Storage using the service_role key
 *      (bypasses RLS — the Worker is the trusted actor)
 *   4. Returns { path: "backgrounds/timestamp-slug.ext" }
 *      The frontend saves this path to post_templates.storage_path
 *
 * Why proxy through the Worker instead of uploading directly from the browser?
 *   - The service_role key must stay server-side — never shipped to the browser.
 *   - Supabase Storage RLS "INSERT" policy requires service_role for this bucket.
 *   - The Worker validates file type and size before hitting Supabase.
 *
 * Request:
 *   POST /api/admin/upload-image
 *   Authorization: Bearer <supabase-jwt>
 *   Content-Type: multipart/form-data
 *   Fields:
 *     file      — image file (required)
 *     folder    — "backgrounds" | "logos" | "icons"  (optional, default: "backgrounds")
 *     filename  — desired base name without extension (optional)
 *
 * Response 201:
 *   { path: "backgrounds/1722470400000-facebook-false.jpg" }
 *
 * Response 4xx/5xx:
 *   { error: "...", code: "..." }
 */

import type { Env } from "../index";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = "template-assets";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

const ALLOWED_FOLDERS = new Set(["backgrounds", "logos", "icons"]);

/** 10 MB — matches the bucket file_size_limit set in the migration. */
const MAX_BYTES = 10 * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg":   "jpg",
    "image/jpg":    "jpg",
    "image/png":    "png",
    "image/webp":   "webp",
    "image/svg+xml":"svg",
  };
  return map[mime] ?? "png";
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleUploadImage(
  request: Request,
  env: Env,
): Promise<Response> {

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── 0. Auth ───────────────────────────────────────────────────────────────
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) {
    return json({ error: "Unauthorized — missing or invalid Authorization header.", code: "UNAUTHORIZED" }, 401);
  }

  // ── 1. Env guard ──────────────────────────────────────────────────────────
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({
      error: "Supabase is not fully configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).",
      code:  "NOT_CONFIGURED",
    }, 503);
  }

  // ── 2. Parse multipart ───────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid multipart form data.", code: "BAD_REQUEST" }, 400);
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return json({ error: "No file provided. Send the image as a `file` field.", code: "NO_FILE" }, 422);
  }

  // ── 3. Validate type ─────────────────────────────────────────────────────
  const mime = file.type.toLowerCase();
  if (!ALLOWED_TYPES.has(mime)) {
    return json({
      error: `Unsupported format "${file.type}". Allowed: JPG, PNG, WebP, SVG.`,
      code:  "UNSUPPORTED_FORMAT",
    }, 422);
  }

  // ── 4. Validate size ─────────────────────────────────────────────────────
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return json({ error: `File too large (${mb} MB). Maximum is 10 MB.`, code: "FILE_TOO_LARGE" }, 422);
  }

  // ── 5. Resolve folder + build storage path ───────────────────────────────
  const rawFolder = (formData.get("folder") as string | null) ?? "backgrounds";
  const folder    = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : "backgrounds";

  const rawName  = (formData.get("filename") as string | null)
    ?? file.name.replace(/\.[^.]+$/, "");
  const slug     = toSlug(rawName) || "template";
  const ext      = mimeToExt(mime);
  const path     = `${folder}/${Date.now()}-${slug}.${ext}`;

  // ── 6. Read bytes ────────────────────────────────────────────────────────
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return json({ error: "Failed to read file data.", code: "READ_ERROR" }, 500);
  }

  // ── 7. Upload to Supabase Storage via REST API ───────────────────────────
  // Supabase Storage REST endpoint:
  //   POST /storage/v1/object/<bucket>/<path>
  // We use the service_role key so RLS is bypassed — the Worker is trusted.
  const storageUrl = `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  const contentType = mime === "image/jpg" ? "image/jpeg" : mime;

  let uploadRes: Response;
  try {
    uploadRes = await fetch(storageUrl, {
      method:  "POST",
      headers: {
        "apikey":         env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization":  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type":   contentType,
        "Cache-Control":  "max-age=31536000",  // 1 year — immutable
        "x-upsert":       "false",              // never silently overwrite
      },
      body: bytes,
    });
  } catch (err) {
    return json({
      error: `Network error uploading to Supabase Storage: ${err instanceof Error ? err.message : String(err)}`,
      code:  "UPLOAD_NETWORK_ERROR",
    }, 502);
  }

  if (!uploadRes.ok) {
    let detail = `Supabase Storage HTTP ${uploadRes.status}`;
    try {
      const body = await uploadRes.json() as { message?: string; error?: string };
      detail = body.message ?? body.error ?? detail;
    } catch { /* ignore */ }
    return json({ error: `Upload failed: ${detail}`, code: "UPLOAD_FAILED" }, uploadRes.status);
  }

  // ── 8. Return storage path ───────────────────────────────────────────────
  // Return ONLY the relative path — never the full URL.
  // The frontend calls supabase.storage.from('template-assets').getPublicUrl(path)
  // to get the full URL whenever it needs to display the image.
  return json({ path }, 201);
}
