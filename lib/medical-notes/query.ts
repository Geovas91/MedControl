import type { Database } from "@/types/database";

type RawQueryValue = string | string[] | undefined;
type MedicalNoteStatus = Database["public"]["Enums"]["medical_note_status"];

export const medicalNotesPageSize = 10;
export const medicalNoteStatuses = ["draft", "finalized", "archived"] as const satisfies readonly MedicalNoteStatus[];

export type MedicalNotesListQuery = {
  page: number;
  status: MedicalNoteStatus | null;
};

export type MedicalNotesListSearchParams = {
  page?: RawQueryValue;
  status?: RawQueryValue;
};

function singleValue(value: RawQueryValue) {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: RawQueryValue) {
  const candidate = singleValue(value);
  if (!candidate || !/^\d+$/.test(candidate)) return null;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeMedicalNotesListQuery(searchParams: MedicalNotesListSearchParams): MedicalNotesListQuery {
  const status = singleValue(searchParams.status);
  return {
    page: positiveInteger(searchParams.page) ?? 1,
    status: medicalNoteStatuses.includes(status as MedicalNoteStatus) ? (status as MedicalNoteStatus) : null
  };
}

export function getMedicalNotesPagination(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / medicalNotesPageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return {
    page,
    pageCount,
    from: (page - 1) * medicalNotesPageSize,
    to: page * medicalNotesPageSize - 1
  };
}

export function buildMedicalNotesListHref(query: MedicalNotesListQuery, page: number) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/dashboard/medical-notes?${value}` : "/dashboard/medical-notes";
}
