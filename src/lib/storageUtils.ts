/**
 * src/lib/storageUtils.ts
 *
 * Helpers for working with Supabase Storage paths.
 *
 * Design rule:
 *   The database stores ONLY the storage path relative to the bucket root,
 *   e.g. "backgrounds/facebook-false.png".
 *   The full public URL is always derived at runtime — never stored in the DB.
 *   This means changing the Supabase project URL or bucket name never requires
 *   a data migration.
 *
 * Bucket structure:
 *   template-assets/
 *     backgrounds/   ← template background images
 *     logos/         ← app logo variants
 *     icons/         ← verdict icons
 */

import { supabase } from "@/lib/supabase";

/** The Supabase Storage bucket that holds all template assets. */
export const TEMPLATE_ASSETS_BUCKET = "template-assets";

/**
 * Convert a storage_path (relative to the bucket root) into the full
 * public HTTPS URL served by Supabase CDN.
 *
 * @param storagePath  e.g. "backgrounds/facebook-false.png"
 * @returns            Full public URL, or empty string when path is null/empty.
 *
 * @example
 *   getPublicUrl("backgrounds/facebook-false.png")
 *   // → "https://xxxx.supabase.co/storage/v1/object/public/template-assets/backgrounds/facebook-false.png"
 */
export function getPublicUrl(storagePath: string | null | undefined): string {
  if (!storagePath) return "";
  const { data } = supabase.storage
    .from(TEMPLATE_ASSETS_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Upload an image file to Supabase Storage and return the storage path.
 *
 * @param file      The File object from an <input type="file">.
 * @param folder    Sub-folder inside the bucket. Defaults to "backgrounds".
 * @param filename  Optional desired filename (without extension).
 *                  If omitted, a timestamped slug is generated from the original name.
 * @param token     Supabase auth JWT. Required — upload uses RLS (service_role policy).
 *
 * @returns  { path: "backgrounds/facebook-false.png" } on success.
 * @throws   Error with a human-readable message on failure.
 *
 * @example
 *   const { path } = await uploadTemplateImage(file, "backgrounds", "facebook-false", token);
 *   // Save `path` to post_templates.storage_path in the database
 */
export async function uploadTemplateImage(
  file: File,
  folder: "backgrounds" | "logos" | "icons" = "backgrounds",
  filename?: string,
  token?: string,
): Promise<{ path: string }> {
  // Build the storage path: folder/timestamp-slug.ext
  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const slug = filename
    ? filename.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
    : file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  const path = `${folder}/${Date.now()}-${slug}.${ext}`;

  // Use the user's session token so the upload respects Supabase RLS.
  // The service_role policy on the bucket allows authenticated admin uploads.
  const client = token
    ? supabase.auth.setSession({ access_token: token, refresh_token: "" }).then(() => supabase)
    : Promise.resolve(supabase);

  const sb = await client;

  const { error } = await sb.storage
    .from(TEMPLATE_ASSETS_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",  // 1 year — immutable once uploaded
      upsert:       false,       // never silently overwrite; always create a new key
      contentType:  file.type,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return { path };
}

/**
 * Delete a file from Supabase Storage by its storage path.
 * Call this when a template's background image is replaced or the template is deleted.
 *
 * @param storagePath  e.g. "backgrounds/1722470400000-facebook-false.png"
 * @returns  true on success, false when the file did not exist.
 * @throws   Error on network or permission failure.
 */
export async function deleteStorageFile(storagePath: string): Promise<boolean> {
  if (!storagePath) return false;

  const { error } = await supabase.storage
    .from(TEMPLATE_ASSETS_BUCKET)
    .remove([storagePath]);

  if (error) {
    // "Object not found" is not a hard error — treat as already deleted
    if (error.message.toLowerCase().includes("not found")) return false;
    throw new Error(`Storage delete failed: ${error.message}`);
  }

  return true;
}
