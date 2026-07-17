import type { Database } from "@/types/database";

export type PatientStatus = Database["public"]["Enums"]["patient_status"];

export const patientStatuses = ["active", "follow_up", "inactive"] as const satisfies readonly PatientStatus[];
export const patientPageSizes = [10, 20] as const;

export type PatientListQuery = {
  search: string;
  status: PatientStatus | null;
  page: number;
  pageSize: (typeof patientPageSizes)[number];
};

type RawQueryValue = string | string[] | undefined;

export type PatientListSearchParams = {
  q?: RawQueryValue;
  status?: RawQueryValue;
  page?: RawQueryValue;
  pageSize?: RawQueryValue;
};

function singleValue(value: RawQueryValue) {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: RawQueryValue) {
  const candidate = singleValue(value);

  if (!candidate || !/^\d+$/.test(candidate)) {
    return null;
  }

  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizePatientSearch(value: RawQueryValue) {
  const candidate = singleValue(value);

  if (!candidate) {
    return "";
  }

  return candidate
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s@.+()'\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function normalizePatientListQuery(searchParams: PatientListSearchParams): PatientListQuery {
  const statusValue = singleValue(searchParams.status);
  const requestedPageSize = positiveInteger(searchParams.pageSize);

  return {
    search: normalizePatientSearch(searchParams.q),
    status: patientStatuses.includes(statusValue as PatientStatus) ? (statusValue as PatientStatus) : null,
    page: positiveInteger(searchParams.page) ?? 1,
    pageSize: patientPageSizes.includes(requestedPageSize as (typeof patientPageSizes)[number])
      ? (requestedPageSize as (typeof patientPageSizes)[number])
      : patientPageSizes[0]
  };
}

export function getPatientStatusLabel(status: PatientStatus, locale: "es" | "en" = "es") {
  const labels: Record<"es" | "en", Record<PatientStatus, string>> = {
    es: {
      active: "Activo",
      follow_up: "Seguimiento",
      inactive: "Inactivo"
    },
    en: {
      active: "Active",
      follow_up: "Follow-up",
      inactive: "Inactive"
    }
  };

  return labels[locale][status];
}

export function formatPatientBirthDate(value: string | null, locale = "es-MX") {
  if (!value) {
    return "Sin registro";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function getPatientPagination(total: number, requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);

  return {
    page,
    pageCount,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}

export function buildPatientListHref(query: PatientListQuery, page: number) {
  const params = new URLSearchParams();

  if (query.search) {
    params.set("q", query.search);
  }

  if (query.status) {
    params.set("status", query.status);
  }

  if (query.pageSize !== patientPageSizes[0]) {
    params.set("pageSize", String(query.pageSize));
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const value = params.toString();
  return value ? `/dashboard/patients?${value}` : "/dashboard/patients";
}
