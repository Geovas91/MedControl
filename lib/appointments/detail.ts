import { calculateAppointmentDuration } from "@/lib/appointments/format";
import type { AppointmentStatus } from "@/lib/appointments/query";
import { getAppointmentStatusSuccessMessage } from "@/lib/appointments/status";

type RawDetailQueryValue = string | string[] | undefined;

export type AppointmentDetailSearchParams = {
  created?: RawDetailQueryValue;
  updated?: RawDetailQueryValue;
  status_updated?: RawDetailQueryValue;
  calendar_email?: RawDetailQueryValue;
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
  const statusMessage = getAppointmentStatusSuccessMessage(searchParams.status_updated);
  if (statusMessage) return statusMessage;
  if (searchParams.updated === "1") return "La cita se actualizó correctamente.";
  if (searchParams.created === "1") return "La cita se creó correctamente.";
  return null;
}

export function getAppointmentCalendarEmailMessage(searchParams: AppointmentDetailSearchParams) {
  const value = Array.isArray(searchParams.calendar_email) ? searchParams.calendar_email[0] : searchParams.calendar_email;
  const messages = {
    sent: { tone: "success" as const, text: "La invitación de calendario se envió al correo del paciente." },
    missing_recipient: { tone: "warning" as const, text: "La cita se guardó, pero el paciente no tiene un correo válido para recibir la invitación." },
    failed: { tone: "warning" as const, text: "La cita se guardó, pero no fue posible enviar la invitación de calendario." },
    delivery_unknown: { tone: "warning" as const, text: "La cita se guardó. El proveedor no confirmó el envío; no se realizó un reintento automático para evitar duplicados." },
    disabled: { tone: "warning" as const, text: "La cita se guardó, pero el envío de correo está deshabilitado o incompleto en este entorno." },
    duplicate: { tone: "neutral" as const, text: "Esta operación ya había sido procesada y no se envió una invitación duplicada." }
  };
  return value && Object.hasOwn(messages, value) ? messages[value as keyof typeof messages] : null;
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
