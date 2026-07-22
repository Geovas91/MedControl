import type { Json } from "@/types/database";

export type ClinicalNoteFormValues = {
  specialty: string;
  clinicalImpression: string;
  content: string;
  appointmentId: string;
  templateId: string;
  expectedUpdatedAt: string;
};

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: string) {
  return value || null;
}

export function getClinicalNoteFormValues(formData: FormData): ClinicalNoteFormValues {
  return {
    specialty: text(formData.get("specialty")),
    clinicalImpression: text(formData.get("clinical_impression")),
    content: text(formData.get("content")),
    appointmentId: text(formData.get("appointment_id")),
    templateId: text(formData.get("template_id")),
    expectedUpdatedAt: text(formData.get("expected_updated_at"))
  };
}

export function validateClinicalNoteValues(values: ClinicalNoteFormValues) {
  const errors: Record<string, string> = {};
  if (!values.content) errors.content = "El contenido de la nota es obligatorio.";
  if (values.content.length > 10_000) errors.content = "El contenido no puede exceder 10,000 caracteres.";
  if (values.specialty.length > 120) errors.specialty = "La especialidad no puede exceder 120 caracteres.";
  if (values.clinicalImpression.length > 4_000) {
    errors.clinicalImpression = "La impresión clínica no puede exceder 4,000 caracteres.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      specialty: nullable(values.specialty),
      clinicalImpression: nullable(values.clinicalImpression),
      content: values.content,
      appointmentId: nullable(values.appointmentId),
      templateId: nullable(values.templateId)
    }
  };
}

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getClinicalNoteContent(value: Json) {
  if (!isRecord(value)) return "Sin contenido estructurado disponible.";
  if (typeof value.content === "string") return value.content;
  if (typeof value.summary === "string") return value.summary;
  return "Sin contenido estructurado disponible.";
}

export function mergeClinicalNoteContent(value: Json, content: string): Json {
  return isRecord(value) ? { ...value, content } : { content };
}

export function getTemplateContentSeed(value: Json) {
  if (!isRecord(value) || !Array.isArray(value.sections)) return "";

  return value.sections
    .flatMap((section) => {
      if (!isRecord(section)) return [];
      const heading = typeof section.title === "string" ? [section.title] : [];
      const fields = Array.isArray(section.fields)
        ? section.fields.flatMap((field) => (isRecord(field) && typeof field.label === "string" ? [`${field.label}:`] : []))
        : [];
      return [...heading, ...fields, ""];
    })
    .join("\n")
    .trim();
}
