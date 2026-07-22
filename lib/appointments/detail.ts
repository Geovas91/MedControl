import { calculateAppointmentDuration } from "@/lib/appointments/format";
import type { AppointmentStatus } from "@/lib/appointments/query";

type RawDetailQueryValue = string | string[] | undefined;

export type AppointmentDetailSearchParams = {
  created?: RawDetailQueryValue;
  updated?: RawDetailQueryValue;
};

export type AppointmentDetailDateTime = {
  localDate: string | null;
  dateLabel: string;
  startsLabel: string;
  endsLabel: string;
  durationLabel: string;
};

function formatTimestamp(value: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("es-MX", { ...options, timeZone }).format(date);
  } catch {
    return null;
  }
}

function localDateFromTimestamp(value: string, timeZone: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

export function formatAppointmentDetailDateTime(
  startsAt: string,
  endsAt: string,
  timeZone: string
): AppointmentDetailDateTime {
  const duration = calculateAppointmentDuration(startsAt, endsAt);

  return {
    localDate: localDateFromTimestamp(startsAt, timeZone),
    dateLabel:
      formatTimestamp(startsAt, timeZone, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }) ?? "Sin registro",
    startsLabel:
      formatTimestamp(startsAt, timeZone, {
        hour: "2-digit",
        minute: "2-digit"
      }) ?? "Sin registro",
    endsLabel:
      formatTimestamp(endsAt, timeZone, {
        hour: "2-digit",
        minute: "2-digit"
      }) ?? "Sin registro",
    durationLabel: duration === null ? "Sin registro" : `${duration} min`
  };
}

export function formatAppointmentCreatedAt(value: string, timeZone: string) {
  return (
    formatTimestamp(value, timeZone, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }) ?? "Sin registro"
  );
}

export function getAppointmentDetailMessage(searchParams: AppointmentDetailSearchParams) {
  if (searchParams.updated === "1") return "La cita se actualizó correctamente.";
  if (searchParams.created === "1") return "La cita se creó correctamente.";
  return null;
}

export function getAppointmentDetailAgendaHref(localDate: string | null) {
  return localDate
    ? `/dashboard/appointments?date=${encodeURIComponent(localDate)}`
    : "/dashboard/appointments";
}

export function getSafeAppointmentMeetingUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getAppointmentDetailStatusVariant(status: AppointmentStatus) {
  if (status === "completed") return "green" as const;
  if (status === "waiting") return "amber" as const;
  if (status === "scheduled" || status === "confirmed") return "teal" as const;
  return "slate" as const;
}
