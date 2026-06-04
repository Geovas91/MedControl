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
    `Appointment with ${appointment.doctor}`,
    "Calendar invitations should not include sensitive clinical information."
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MedControl//Mock Appointment Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@medcontrol.mock`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(appointment.startsAt)}`,
    `DTEND:${toIcsDate(appointment.endsAt)}`,
    `SUMMARY:${escapeIcsText(`${appointment.type} appointment`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(appointment.location)}`,
    `STATUS:${appointment.status === "Completed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}
