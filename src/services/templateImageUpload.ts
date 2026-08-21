import { API_BASE_URL } from "@/constants";

const BACKGROUND_FOLDER = "backgrounds";

export const ALLOWED_TEMPLATE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const MAX_TEMPLATE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export function validateTemplateImage(file: File): string | null {
  if (!ALLOWED_TEMPLATE_IMAGE_MIME_TYPES.includes(file.type.toLowerCase())) {
    return "Allowed formats: JPG, PNG, WebP";
  }
  if (file.size > MAX_TEMPLATE_IMAGE_SIZE_BYTES) {
    return "File too large. Maximum is 10 MB.";
  }
  return null;
}

export async function uploadTemplateBackground(file: File, token: string | null): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", BACKGROUND_FOLDER);

  const response = await fetch(`${API_BASE_URL}/admin/upload-image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await response.json() as { path?: string; error?: string };

  if (!response.ok || !data.path) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data.path;
}
