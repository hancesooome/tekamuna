import { API_BASE_URL } from "@/constants";
import type { FieldType, TemplateField } from "@/types/postTemplate";

export type FieldDefaultsMap = Partial<Record<FieldType, Partial<TemplateField>>>;

const NON_DEFAULT_PROPS = new Set([
  "id", "type", "label", "x", "y", "zIndex", "visible",
  "locked", "staticValue", "rotation", "opacity",
]);

export async function fetchFieldDefaults(token: string | null): Promise<FieldDefaultsMap> {
  if (!token) return {};
  try {
    const response = await fetch(`${API_BASE_URL}/admin/field-defaults`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return {};
    const data = await response.json() as { defaults?: FieldDefaultsMap };
    return data.defaults ?? {};
  } catch {
    return {};
  }
}

export async function persistFieldDefaults(
  fields: TemplateField[],
  token: string | null,
  existing: FieldDefaultsMap,
): Promise<void> {
  if (!token) return;

  const updated = { ...existing };
  for (const field of fields) {
    const style: Partial<TemplateField> = {};
    for (const [key, value] of Object.entries(field)) {
      if (!NON_DEFAULT_PROPS.has(key)) {
        (style as Record<string, unknown>)[key] = value;
      }
    }
    updated[field.type] = { ...updated[field.type], ...style };
  }

  try {
    await fetch(`${API_BASE_URL}/admin/field-defaults`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ defaults: updated }),
    });
  } catch {
    // Persisting cross-template style defaults is non-critical.
  }
}
