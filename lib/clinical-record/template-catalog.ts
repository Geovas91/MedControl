export const clinicalTemplateSpecialties = [
  "General / Multidisciplinaria",
  "Medicina general",
  "Pediatría",
  "Ginecología y obstetricia",
  "Medicina interna",
  "Cardiología",
  "Endocrinología",
  "Dermatología",
  "Traumatología y ortopedia",
  "Gastroenterología",
  "Neurología",
  "Psiquiatría",
  "Psicología"
] as const;

export type TemplateOrigin = "system" | "clinic";

export function normalizeTemplateFilters(query: Record<string, string | string[] | undefined>) {
  const first = (key: string) => typeof query[key] === "string" ? query[key] : undefined;
  const kindValue = first("kind");
  const originValue = first("origin");
  const statusValue = first("status");
  const kind: "note" | "consent" | undefined = kindValue === "note" || kindValue === "consent" ? kindValue : undefined;
  const origin: "system" | "clinic" | undefined = originValue === "system" || originValue === "clinic" ? originValue : undefined;
  const status: "active" | "inactive" | undefined = statusValue === "active" || statusValue === "inactive" ? statusValue : undefined;
  const specialtyValue = first("specialty");
  const specialty = clinicalTemplateSpecialties.includes(specialtyValue as (typeof clinicalTemplateSpecialties)[number]) ? specialtyValue : undefined;
  const search = first("q")?.trim().slice(0, 100) || undefined;
  return { kind, origin, status, specialty, search };
}
