import { getClinicDateRange } from "../dashboard/timezone.ts";
import type { Database } from "@/types/database";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export const appointmentStatuses = [
  "scheduled",
  "confirmed",
  "waiting",
  "completed",
  "cancelled"
] as const satisfies readonly AppointmentStatus[];

export const appointmentPeriods = ["day", "month", "upcoming", "past", "all", "range"] as const;
export type AppointmentPeriod = (typeof appointmentPeriods)[number];
export const appointmentAgendaPageSize = 25;
export const appointmentAgendaMaxRangeDays = 366;

type RawQueryValue = string | string[] | undefined;

export type AppointmentSearchParams = {
  date?: RawQueryValue;
  period?: RawQueryValue;
  from?: RawQueryValue;
  to?: RawQueryValue;
  status?: RawQueryValue;
  doctor?: RawQueryValue;
  q?: RawQueryValue;
  page?: RawQueryValue;
  created?: RawQueryValue;
  updated?: RawQueryValue;
};

export type AppointmentRangeError = "missing_or_invalid" | "reversed" | "too_long";

export type AppointmentQuery = {
  date: string;
  period: AppointmentPeriod;
  from: string | null;
  to: string | null;
  status: AppointmentStatus | null;
  doctor: string | null;
  search: string;
  page: number;
  rangeError: AppointmentRangeError | null;
  dateWasNormalized: boolean;
  filtersWereNormalized: boolean;
};

export type AppointmentPeriodBounds = { startIso: string | null; endIso: string | null };

export type AppointmentDayTotals = {
  total: number;
  scheduledOrConfirmed: number;
  waiting: number;
  completed: number;
  cancelled: number;
};

function singleValue(value: RawQueryValue) {
  return typeof value === "string" ? value : undefined;
}

export function isCanonicalAppointmentDate(value: string | undefined) {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function isCanonicalAppointmentUuid(value: string | undefined) {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizeAppointmentSearch(value: RawQueryValue) {
  const candidate = singleValue(value);
  if (!candidate) return "";
  return candidate
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s@.+()'\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function normalizePage(value: RawQueryValue) {
  const candidate = singleValue(value);
  if (!candidate || !/^\d+$/.test(candidate)) return 1;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function daysBetweenInclusive(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export function normalizeAppointmentQuery(searchParams: AppointmentSearchParams, clinicToday: string): AppointmentQuery {
  const requestedDate = singleValue(searchParams.date);
  const requestedPeriod = singleValue(searchParams.period);
  const rawFrom = singleValue(searchParams.from);
  const rawTo = singleValue(searchParams.to);
  const rawStatus = singleValue(searchParams.status);
  const rawDoctor = singleValue(searchParams.doctor);
  const period = appointmentPeriods.includes(requestedPeriod as AppointmentPeriod)
    ? (requestedPeriod as AppointmentPeriod)
    : "day";
  const from = isCanonicalAppointmentDate(rawFrom) ? rawFrom! : null;
  const to = isCanonicalAppointmentDate(rawTo) ? rawTo! : null;
  let rangeError: AppointmentRangeError | null = null;

  if (period === "range") {
    if (!from || !to) rangeError = "missing_or_invalid";
    else if (from > to) rangeError = "reversed";
    else if (daysBetweenInclusive(from, to) > appointmentAgendaMaxRangeDays) rangeError = "too_long";
  }

  const page = normalizePage(searchParams.page);
  const filtersWereNormalized = Boolean(
    (requestedPeriod && period !== requestedPeriod) ||
      (rawStatus && !appointmentStatuses.includes(rawStatus as AppointmentStatus)) ||
      (rawDoctor && !isCanonicalAppointmentUuid(rawDoctor)) ||
      (rawFrom && !from) ||
      (rawTo && !to) ||
      (singleValue(searchParams.page) && String(page) !== singleValue(searchParams.page))
  );

  return {
    date: isCanonicalAppointmentDate(requestedDate) ? requestedDate! : clinicToday,
    period,
    from,
    to,
    status: appointmentStatuses.includes(rawStatus as AppointmentStatus) ? (rawStatus as AppointmentStatus) : null,
    doctor: isCanonicalAppointmentUuid(rawDoctor) ? rawDoctor! : null,
    search: normalizeAppointmentSearch(searchParams.q),
    page,
    rangeError,
    dateWasNormalized: requestedDate !== undefined && !isCanonicalAppointmentDate(requestedDate),
    filtersWereNormalized
  };
}

export function hasAppointmentCreatedMessage(searchParams: AppointmentSearchParams) {
  return singleValue(searchParams.created) === "1";
}

export function addDaysToAppointmentDate(value: string, amount: number) {
  if (!isCanonicalAppointmentDate(value)) throw new RangeError(`Invalid appointment date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

function followingMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-01`;
}

export function getAppointmentPeriodBounds(query: AppointmentQuery, timeZone: string, now = new Date()): AppointmentPeriodBounds {
  // Upcoming and past form an exact, non-overlapping partition at the captured instant.
  if (query.period === "upcoming") return { startIso: now.toISOString(), endIso: null };
  if (query.period === "past") return { startIso: null, endIso: now.toISOString() };
  if (query.period === "all") return { startIso: null, endIso: null };
  if (query.period === "range") {
    if (query.rangeError || !query.from || !query.to) throw new RangeError("Invalid appointment range");
    return {
      startIso: getClinicDateRange(timeZone, query.from).startIso,
      endIso: getClinicDateRange(timeZone, query.to).endIso
    };
  }
  if (query.period === "month") {
    const monthStart = `${query.date.slice(0, 7)}-01`;
    return {
      startIso: getClinicDateRange(timeZone, monthStart).startIso,
      endIso: getClinicDateRange(timeZone, followingMonth(monthStart)).startIso
    };
  }
  const day = getClinicDateRange(timeZone, query.date);
  return { startIso: day.startIso, endIso: day.endIso };
}

export function getAppointmentAgendaPagination(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / appointmentAgendaPageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return { page, pageCount, from: (page - 1) * appointmentAgendaPageSize, to: page * appointmentAgendaPageSize - 1 };
}

export function isAppointmentPeriodAscending(period: AppointmentPeriod) {
  return period !== "past" && period !== "all";
}

export function buildAppointmentSearchFilter(search: string, patientIds: string[]) {
  if (!search) return null;
  const title = `title.ilike."*${search}*"`;
  return patientIds.length ? `${title},patient_id.in.(${patientIds.join(",")})` : title;
}

export function buildAppointmentAgendaHref(
  query: AppointmentQuery,
  overrides: Partial<Pick<AppointmentQuery, "date" | "period" | "from" | "to" | "page">> = {}
) {
  const value = { ...query, ...overrides };
  const params = new URLSearchParams({ date: value.date, period: value.period });
  if (value.period === "range" && value.from) params.set("from", value.from);
  if (value.period === "range" && value.to) params.set("to", value.to);
  if (value.status) params.set("status", value.status);
  if (value.doctor) params.set("doctor", value.doctor);
  if (value.search) params.set("q", value.search);
  if (value.page > 1) params.set("page", String(value.page));
  return `/dashboard/appointments?${params.toString()}`;
}

export function getAppointmentStatusLabel(status: AppointmentStatus) {
  const labels: Record<AppointmentStatus, string> = {
    scheduled: "Programada",
    confirmed: "Confirmada",
    waiting: "En espera",
    completed: "Completada",
    cancelled: "Cancelada"
  };
  return labels[status];
}

export function summarizeAppointmentStatusCounts(counts: Partial<Record<AppointmentStatus, number>>): AppointmentDayTotals {
  return {
    total: appointmentStatuses.reduce((total, status) => total + (counts[status] ?? 0), 0),
    scheduledOrConfirmed: (counts.scheduled ?? 0) + (counts.confirmed ?? 0),
    waiting: counts.waiting ?? 0,
    completed: counts.completed ?? 0,
    cancelled: counts.cancelled ?? 0
  };
}

export function summarizeAppointmentStatuses(statuses: AppointmentStatus[]): AppointmentDayTotals {
  return summarizeAppointmentStatusCounts(
    statuses.reduce<Partial<Record<AppointmentStatus, number>>>((counts, status) => {
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {})
  );
}
