import type { Database } from "@/types/database";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export const appointmentStatuses = [
  "scheduled",
  "confirmed",
  "waiting",
  "completed",
  "cancelled"
] as const satisfies readonly AppointmentStatus[];

type RawQueryValue = string | string[] | undefined;

export type AppointmentSearchParams = {
  date?: RawQueryValue;
  status?: RawQueryValue;
  doctor?: RawQueryValue;
  q?: RawQueryValue;
  created?: RawQueryValue;
};

export type AppointmentQuery = {
  date: string;
  status: AppointmentStatus | null;
  doctor: string | null;
  search: string;
  dateWasNormalized: boolean;
};

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

export function isCanonicalAppointmentUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizeAppointmentSearch(value: RawQueryValue) {
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

export function normalizeAppointmentQuery(
  searchParams: AppointmentSearchParams,
  clinicToday: string
): AppointmentQuery {
  const requestedDate = singleValue(searchParams.date);
  const status = singleValue(searchParams.status);
  const doctor = singleValue(searchParams.doctor);

  return {
    date: isCanonicalAppointmentDate(requestedDate) ? requestedDate! : clinicToday,
    status: appointmentStatuses.includes(status as AppointmentStatus) ? (status as AppointmentStatus) : null,
    doctor: isCanonicalAppointmentUuid(doctor) ? doctor! : null,
    search: normalizeAppointmentSearch(searchParams.q),
    dateWasNormalized: requestedDate !== undefined && !isCanonicalAppointmentDate(requestedDate)
  };
}

export function hasAppointmentCreatedMessage(searchParams: AppointmentSearchParams) {
  return singleValue(searchParams.created) === "1";
}

export function addDaysToAppointmentDate(value: string, amount: number) {
  if (!isCanonicalAppointmentDate(value)) {
    throw new RangeError(`Invalid appointment date: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

export function buildAppointmentAgendaHref(query: AppointmentQuery, date = query.date) {
  const params = new URLSearchParams({ date });

  if (query.status) {
    params.set("status", query.status);
  }

  if (query.doctor) {
    params.set("doctor", query.doctor);
  }

  if (query.search) {
    params.set("q", query.search);
  }

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

function searchableValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-MX");
}

export function matchesAppointmentSearch(title: string, patientName: string, search: string) {
  if (!search) {
    return true;
  }

  const normalizedSearch = searchableValue(search);
  return [title, patientName].some((value) => searchableValue(value).includes(normalizedSearch));
}

export function summarizeAppointmentStatuses(statuses: AppointmentStatus[]): AppointmentDayTotals {
  return statuses.reduce<AppointmentDayTotals>(
    (totals, status) => {
      totals.total += 1;

      if (status === "scheduled" || status === "confirmed") {
        totals.scheduledOrConfirmed += 1;
      } else {
        totals[status] += 1;
      }

      return totals;
    },
    {
      total: 0,
      scheduledOrConfirmed: 0,
      waiting: 0,
      completed: 0,
      cancelled: 0
    }
  );
}
