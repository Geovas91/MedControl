import type { Json } from "@/types/database";

export type TemplateKind = "note" | "consent";
export type TemplateFormValues = {
  name: string;
  specialty: string;
  description: string;
  content: string;
  kind: TemplateKind;
  isActive: boolean;
  expectedUpdatedAt: string;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function getTemplateFormValues(formData: FormData): TemplateFormValues {
  return {
    name: text(formData, "name"),
    specialty: text(formData, "specialty"),
    description: text(formData, "description"),
    content: text(formData, "content"),
    kind: formData.get("kind") === "consent" ? "consent" : "note",
    isActive: formData.get("is_active") === "on",
    expectedUpdatedAt: text(formData, "expected_updated_at")
  };
}

export function validateTemplateValues(values: TemplateFormValues) {
  const errors: Record<string, string> = {};
  if (!values.name || values.name.length > 160) errors.name = "Ingresa un nombre de hasta 160 caracteres.";
  if (values.specialty.length > 120) errors.specialty = "La especialidad no puede superar 120 caracteres.";
  if (values.description.length > 500) errors.description = "La descripcion no puede superar 500 caracteres.";
  if (!values.content || values.content.length > 12000) errors.content = "Ingresa contenido de hasta 12,000 caracteres.";
  return { valid: Object.keys(errors).length === 0, errors } as const;
}

export function createTemplateSchema(content: string, kind: TemplateKind): Json {
  if (kind === "consent") return { content, templateKind: "consent" };
  return {
    content,
    sections: [{
      id: "content",
      title: "Contenido",
      fields: [{ id: "content", label: "Contenido", type: "textarea", required: false }]
    }]
  };
}

export function getTemplateContent(schema: Json) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "";
  const value = (schema as Record<string, Json>).content;
  return typeof value === "string" ? value : "";
}
