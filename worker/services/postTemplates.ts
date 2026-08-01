/**
 * worker/services/postTemplates.ts
 *
 * Supabase REST client for the `post_templates` table.
 * Uses direct PostgREST HTTP calls — no SDK, consistent with the rest of the
 * worker codebase (cache.ts, adminSettings.ts).
 *
 * Exported functions:
 *   listTemplates(env, query?)   — GET  filtered list
 *   getTemplateById(env, id)     — GET  single row by PK
 *   getTemplateFor(env, p, v)    — GET  the active template for a platform+verdict pair
 *   createTemplate(env, payload) — POST insert new row
 *   updateTemplate(env, id, payload) — PATCH partial update
 *   deleteTemplate(env, id)      — DELETE hard delete
 *   toggleActive(env, id, active)— PATCH is_active shortcut
 *
 * All functions return a ServiceResult<T> discriminated union so callers
 * never have to try/catch — errors are values, not exceptions.
 *
 * The Worker uses SUPABASE_URL + SUPABASE_ANON_KEY for reads (public, RLS
 * enforced) and SUPABASE_SERVICE_ROLE_KEY for writes (bypasses RLS).
 * If the service role key is absent, write operations return a permission error.
 */

import type { Env } from "../index";
import type {
  PostTemplate,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  ListTemplatesQuery,
} from "../../src/types/postTemplate";

// ── Result type ───────────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string; status: number };

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function fail(error: string, status = 500): ServiceResult<never> {
  return { ok: false, error, status };
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

const TABLE = "post_templates";

/** Build the base PostgREST URL for the table. */
function tableUrl(env: Env, path = ""): string {
  return `${env.SUPABASE_URL}/rest/v1/${TABLE}${path}`;
}

/** Headers for read operations — uses anon key, subject to RLS. */
function readHeaders(env: Env): Record<string, string> {
  return {
    "apikey":        env.SUPABASE_ANON_KEY ?? "",
    "Authorization": `Bearer ${env.SUPABASE_ANON_KEY ?? ""}`,
    "Content-Type":  "application/json",
  };
}

/**
 * Headers for admin read operations — uses service role key so RLS is bypassed
 * and inactive templates are visible. Falls back to anon key when service key
 * is absent (e.g. the public /active endpoint).
 */
function adminReadHeaders(env: Env): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (key) {
    return {
      "apikey":        key,
      "Authorization": `Bearer ${key}`,
      "Content-Type":  "application/json",
    };
  }
  return readHeaders(env);
}

/**
 * Headers for write operations — uses service role key to bypass RLS.
 * Returns null when the key is not configured so callers can reject early.
 */
function writeHeaders(env: Env): Record<string, string> | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return {
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Content-Type":  "application/json",
  };
}

/** Check that Supabase env vars are present before making any call. */
function guardEnv(env: Env): ServiceResult<never> | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return fail("Supabase is not configured (missing SUPABASE_URL or SUPABASE_ANON_KEY).", 503);
  }
  return null;
}

/**
 * Parse a Supabase error response into a human-readable string.
 * PostgREST errors have shape: { message, details, hint, code }
 */
async function parseSupabaseError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { message?: string; details?: string; hint?: string };
    const parts = [body.message, body.details, body.hint].filter(Boolean);
    return parts.length > 0
      ? parts.join(" — ")
      : `Supabase HTTP ${res.status}`;
  } catch {
    return `Supabase HTTP ${res.status}`;
  }
}

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * List templates with optional filters.
 * Admins call this with no filter to see all; the renderer calls it with
 * { platform, verdict, is_active: true } to find the right template.
 */
export async function listTemplates(
  env: Env,
  query: ListTemplatesQuery = {},
): Promise<ServiceResult<PostTemplate[]>> {
  const guard = guardEnv(env);
  if (guard) return guard;

  const params = new URLSearchParams({ select: "*", order: "created_at.desc" });

  if (query.platform  !== undefined) params.set("platform",  `eq.${query.platform}`);
  if (query.verdict   !== undefined) params.set("verdict",   `eq.${query.verdict}`);
  if (query.is_active !== undefined) params.set("is_active", `eq.${query.is_active}`);

  try {
    const res = await fetch(`${tableUrl(env)}?${params}`, {
      headers: adminReadHeaders(env), // service role so inactive templates are visible
    });

    if (!res.ok) return fail(await parseSupabaseError(res), res.status);

    const rows = await res.json() as PostTemplate[];
    return ok(rows);
  } catch (err) {
    return fail(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fetch a single template by its UUID primary key.
 * Returns 404 when the row does not exist.
 */
export async function getTemplateById(
  env: Env,
  id: string,
): Promise<ServiceResult<PostTemplate>> {
  const guard = guardEnv(env);
  if (guard) return guard;

  try {
    const params = new URLSearchParams({ select: "*", id: `eq.${id}` });
    const res = await fetch(`${tableUrl(env)}?${params}`, {
      headers: {
        ...adminReadHeaders(env), // service role so inactive templates are visible
        // Return a single object instead of a 1-element array
        "Accept": "application/vnd.pgrst.object+json",
      },
    });

    // PostgREST returns 406 when no row matches with the object accept header
    if (res.status === 406) return fail(`Template not found: ${id}`, 404);
    if (!res.ok)            return fail(await parseSupabaseError(res), res.status);

    return ok(await res.json() as PostTemplate);
  } catch (err) {
    return fail(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Find the single active template for a given platform + verdict combination.
 * Used by the share-image renderer to pick the right canvas layout.
 * Returns 404 when no active template exists for the combination.
 */
export async function getTemplateFor(
  env: Env,
  platform: PostTemplate["platform"],
  verdict:  PostTemplate["verdict"],
): Promise<ServiceResult<PostTemplate>> {
  const guard = guardEnv(env);
  if (guard) return guard;

  try {
    const params = new URLSearchParams({
      select:    "*",
      platform:  `eq.${platform}`,
      verdict:   `eq.${verdict}`,
      is_active: "eq.true",
      limit:     "1",
    });

    const res = await fetch(`${tableUrl(env)}?${params}`, {
      headers: {
        ...readHeaders(env),
        "Accept": "application/vnd.pgrst.object+json",
      },
    });

    if (res.status === 406) {
      return fail(
        `No active template found for platform="${platform}" verdict="${verdict}".`,
        404,
      );
    }
    if (!res.ok) return fail(await parseSupabaseError(res), res.status);

    return ok(await res.json() as PostTemplate);
  } catch (err) {
    return fail(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Write operations ──────────────────────────────────────────────────────────

/**
 * Insert a new template row.
 * Requires SUPABASE_SERVICE_ROLE_KEY — the anon key cannot write.
 */
export async function createTemplate(
  env: Env,
  payload: CreateTemplatePayload,
): Promise<ServiceResult<PostTemplate>> {
  const guard = guardEnv(env);
  if (guard) return guard;

  const headers = writeHeaders(env);
  if (!headers) {
    return fail("SUPABASE_SERVICE_ROLE_KEY is not configured. Write operations are not available.", 503);
  }

  try {
    const res = await fetch(tableUrl(env), {
      method: "POST",
      headers: {
        ...headers,
        // Tell PostgREST to return the newly created row
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        name:           payload.name,
        platform:       payload.platform,
        verdict:        payload.verdict,
        canvas_width:   payload.canvas_width,
        canvas_height:  payload.canvas_height,
        storage_path:   payload.storage_path  ?? null,
        config_json:    payload.config_json   ?? [],
        is_active:      payload.is_active     ?? false,
      }),
    });

    if (!res.ok) return fail(await parseSupabaseError(res), res.status);

    // PostgREST returns an array when Prefer: return=representation
    const rows = await res.json() as PostTemplate[];
    if (!rows[0]) return fail("Insert succeeded but returned no row.", 500);

    return ok(rows[0]);
  } catch (err) {
    return fail(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Partially update an existing template.
 * Only the fields present in `payload` are changed; omitted fields are untouched.
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export async function updateTemplate(
  env: Env,
  id: string,
  payload: UpdateTemplatePayload,
): Promise<ServiceResult<PostTemplate>> {
  const guard = guardEnv(env);
  if (guard) return guard;

  const headers = writeHeaders(env);
  if (!headers) {
    return fail("SUPABASE_SERVICE_ROLE_KEY is not configured. Write operations are not available.", 503);
  }

  // Build the PATCH body — only include keys that were explicitly provided
  const body: Record<string, unknown> = {};
  if (payload.name          !== undefined) body.name          = payload.name;
  if (payload.platform      !== undefined) body.platform      = payload.platform;
  if (payload.verdict       !== undefined) body.verdict       = payload.verdict;
  if (payload.canvas_width  !== undefined) body.canvas_width  = payload.canvas_width;
  if (payload.canvas_height !== undefined) body.canvas_height = payload.canvas_height;
  if (payload.storage_path  !== undefined) body.storage_path  = payload.storage_path;
  if (payload.config_json   !== undefined) body.config_json   = payload.config_json;
  if (payload.is_active     !== undefined) body.is_active     = payload.is_active;

  if (Object.keys(body).length === 0) {
    return fail("No fields provided to update.", 400);
  }

  try {
    const params = new URLSearchParams({ id: `eq.${id}` });
    const res = await fetch(`${tableUrl(env)}?${params}`, {
      method: "PATCH",
      headers: {
        ...headers,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return fail(await parseSupabaseError(res), res.status);

    const rows = await res.json() as PostTemplate[];
    if (!rows[0]) return fail(`Template not found: ${id}`, 404);

    return ok(rows[0]);
  } catch (err) {
    return fail(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Shortcut to flip the is_active flag without sending a full PATCH payload.
 */
export async function toggleActive(
  env: Env,
  id: string,
  active: boolean,
): Promise<ServiceResult<PostTemplate>> {
  return updateTemplate(env, id, { is_active: active });
}

/**
 * Hard-delete a template row by ID.
 * Prefer deactivating (toggleActive false) over deleting in production —
 * deletion is irreversible and removes the config_json permanently.
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export async function deleteTemplate(
  env: Env,
  id: string,
): Promise<ServiceResult<{ deleted: true }>> {
  const guard = guardEnv(env);
  if (guard) return guard;

  const headers = writeHeaders(env);
  if (!headers) {
    return fail("SUPABASE_SERVICE_ROLE_KEY is not configured. Write operations are not available.", 503);
  }

  try {
    const params = new URLSearchParams({ id: `eq.${id}` });
    const res = await fetch(`${tableUrl(env)}?${params}`, {
      method:  "DELETE",
      headers: {
        ...headers,
        "Prefer": "return=minimal",
      },
    });

    // 204 No Content = success for DELETE with return=minimal
    if (res.status === 204) return ok({ deleted: true as const });
    if (!res.ok)            return fail(await parseSupabaseError(res), res.status);

    return ok({ deleted: true as const });
  } catch (err) {
    return fail(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
