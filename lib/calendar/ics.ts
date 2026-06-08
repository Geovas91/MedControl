import type { CalendarSafeAppointment } from "@/types/calendar-integration";

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function toIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function generateAppointmentIcs(appointment: CalendarSafeAppointment) {
  const now = new Date().toISOString();
  const description = [
    `Cita con ${appointment.doctor}`,
    "Las invitaciones de calendario no deben incluir información clínica sensible."
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MedControl//Calendario Demo de Citas//ES",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@medcontrol.mock`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(appointment.startsAt)}`,
    `DTEND:${toIcsDate(appointment.endsAt)}`,
    `SUMMARY:${escapeIcsText(`Cita de ${appointment.type}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(appointment.location)}`,
    `STATUS:${appointment.status === "Completed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}
