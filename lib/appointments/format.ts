import { formatClinicTime } from "@/lib/dashboard/timezone";

export function formatAppointmentDateLabel(value: string, locale = "es-MX") {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function calculateAppointmentDuration(startsAt: string, endsAt: string) {
  const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime();

  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return Math.round(duration / 60_000);
}

export function formatAppointmentTimeRange(startsAt: string, endsAt: string, timeZone: string) {
  const starts = formatClinicTime(startsAt, timeZone);
  const ends = formatClinicTime(endsAt, timeZone);
  const duration = calculateAppointmentDuration(startsAt, endsAt);

  return {
    starts,
    ends,
    durationLabel: duration === null ? "Sin registro" : `${duration} min`
  };
}
