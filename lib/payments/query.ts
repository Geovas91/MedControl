import type { Database } from "@/types/database";

export type ClinicalPaymentStatus = Database["public"]["Enums"]["payment_status"];

export const clinicalPaymentStatuses = ["pending", "paid", "cancelled", "refunded"] as const satisfies readonly ClinicalPaymentStatus[];
export const clinicalPaymentPageSize = 20;

type RawQueryValue = string | string[] | undefined;

export type ClinicalPaymentSearchParams = {
  status?: RawQueryValue;
  patient?: RawQueryValue;
  method?: RawQueryValue;
  date_from?: RawQueryValue;
  date_to?: RawQueryValue;
  q?: RawQueryValue;
  page?: RawQueryValue;
  created?: RawQueryValue;
};

export type ClinicalPaymentQuery = {
  status: ClinicalPaymentStatus | null;
  patient: string | null;
  method: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string;
  page: number;
  filtersWereNormalized: boolean;
};

function singleValue(value: RawQueryValue) {
  return typeof value === "string" ? value : undefined;
}

export function isCanonicalPaymentUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isCanonicalPaymentDate(value: string | undefined) {
  if (!value) {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function normalizeSearch(value: RawQueryValue) {
  const candidate = singleValue(value);

  if (!candidate) {
    return "";
  }

  return candidate
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function normalizeMethod(value: RawQueryValue) {
  const candidate = singleValue(value);

  if (!candidate) {
    return null;
  }

  return candidate.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80) || null;
}

function normalizePage(value: RawQueryValue) {
  const candidate = singleValue(value);

  if (!candidate || !/^\d+$/.test(candidate)) {
    return 1;
  }

  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeClinicalPaymentQuery(searchParams: ClinicalPaymentSearchParams): ClinicalPaymentQuery {
  const rawStatus = singleValue(searchParams.status);
  const rawPatient = singleValue(searchParams.patient);
  const rawDateFrom = singleValue(searchParams.date_from);
  const rawDateTo = singleValue(searchParams.date_to);
  let dateFrom = isCanonicalPaymentDate(rawDateFrom) ? rawDateFrom! : null;
  let dateTo = isCanonicalPaymentDate(rawDateTo) ? rawDateTo! : null;
  let filtersWereNormalized = Boolean(
    (rawStatus && !clinicalPaymentStatuses.includes(rawStatus as ClinicalPaymentStatus)) ||
      (rawPatient && !isCanonicalPaymentUuid(rawPatient)) ||
      (rawDateFrom && !dateFrom) ||
      (rawDateTo && !dateTo)
  );

  if (dateFrom && dateTo && dateFrom > dateTo) {
    dateFrom = null;
    dateTo = null;
    filtersWereNormalized = true;
  }

  return {
    status: clinicalPaymentStatuses.includes(rawStatus as ClinicalPaymentStatus)
      ? (rawStatus as ClinicalPaymentStatus)
      : null,
    patient: isCanonicalPaymentUuid(rawPatient) ? rawPatient! : null,
    method: normalizeMethod(searchParams.method),
    dateFrom,
    dateTo,
    search: normalizeSearch(searchParams.q),
    page: normalizePage(searchParams.page),
    filtersWereNormalized
  };
}

export function getClinicalPaymentStatusLabel(status: ClinicalPaymentStatus) {
  const labels: Record<ClinicalPaymentStatus, string> = {
    pending: "Pendiente",
    paid: "Pagado",
    cancelled: "Cancelado",
    refunded: "Reembolsado"
  };

  return labels[status];
}

export function getClinicalPaymentMethodLabel(value: string | null) {
  const normalized = value?.trim();
  const labels: Record<string, string> = {
    cash: "Efectivo",
    card: "Tarjeta",
    transfer: "Transferencia",
    deposit: "Depósito",
    other: "Otro"
  };

  return normalized ? labels[normalized] ?? normalized : "Sin registro";
}

export function getClinicalPaymentPagination(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / clinicalPaymentPageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);

  return {
    page,
    pageCount,
    from: (page - 1) * clinicalPaymentPageSize,
    to: page * clinicalPaymentPageSize - 1
  };
}

export function buildClinicalPaymentsHref(query: ClinicalPaymentQuery, page: number) {
  const params = new URLSearchParams();

  if (query.status) params.set("status", query.status);
  if (query.patient) params.set("patient", query.patient);
  if (query.method) params.set("method", query.method);
  if (query.dateFrom) params.set("date_from", query.dateFrom);
  if (query.dateTo) params.set("date_to", query.dateTo);
  if (query.search) params.set("q", query.search);
  if (page > 1) params.set("page", String(page));

  const value = params.toString();
  return value ? `/dashboard/payments?${value}` : "/dashboard/payments";
}

export function buildClinicalPaymentDateFilter(startIso: string | null, endIso: string | null) {
  const paidConditions = ["paid_at.not.is.null"];
  const createdConditions = ["paid_at.is.null"];

  if (startIso) {
    paidConditions.push(`paid_at.gte.${startIso}`);
    createdConditions.push(`created_at.gte.${startIso}`);
  }

  if (endIso) {
    paidConditions.push(`paid_at.lt.${endIso}`);
    createdConditions.push(`created_at.lt.${endIso}`);
  }

  if (!startIso && !endIso) {
    return null;
  }

  return `and(${paidConditions.join(",")}),and(${createdConditions.join(",")})`;
}

export function buildClinicalPaymentSearchFilter(search: string, patientIds: string[]) {
  if (!search) {
    return null;
  }

  const concept = `concept.ilike."*${search}*"`;

  if (patientIds.length === 0) {
    return concept;
  }

  return `${concept},patient_id.in.(${patientIds.join(",")})`;
}
