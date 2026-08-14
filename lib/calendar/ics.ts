export type AppointmentIcsMethod = "REQUEST" | "CANCEL";

export type AppointmentIcsInput = {
  method: AppointmentIcsMethod;
  uid: string;
  sequence: number;
  startsAt: string;
  endsAt: string;
  clinicName: string;
  doctorName?: string | null;
  organizerEmail: string;
  attendeeEmail: string;
  location?: string | null;
  meetingUrl?: string | null;
  timestamp?: string;
};

const encoder = new TextEncoder();

export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let chunk = "";
  let limit = 75;

  for (const character of line) {
    const candidate = chunk + character;
    if (encoder.encode(candidate).length > limit && chunk) {
      chunks.push(chunk);
      chunk = character;
      limit = 74;
    } else {
      chunk = candidate;
    }
  }

  chunks.push(chunk);
  return chunks.join("\r\n ");
}

function toIcsDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid calendar date.");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function assertSafeMailto(value: string) {
  if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value)) {
    throw new Error("Invalid calendar email address.");
  }
  return value;
}

export function generateAppointmentIcs(input: AppointmentIcsInput) {
  if (!input.uid || /[\r\n]/.test(input.uid)) throw new Error("Invalid calendar UID.");
  if (!Number.isInteger(input.sequence) || input.sequence < 0) throw new Error("Invalid calendar sequence.");

  const organizer = assertSafeMailto(input.organizerEmail);
  const attendee = assertSafeMailto(input.attendeeEmail);
  const timestamp = toIcsDate(input.timestamp ?? new Date().toISOString());
  const description = [
    input.doctorName ? `Profesional: ${input.doctorName}` : "Cita programada por la clínica.",
    input.meetingUrl ? `Enlace de acceso: ${input.meetingUrl}` : null,
    "Este evento no contiene notas, diagnósticos ni información clínica."
  ].filter((value): value is string => Boolean(value)).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//CliniControl//Invitaciones de citas//ES",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${timestamp}`,
    `LAST-MODIFIED:${timestamp}`,
    `DTSTART:${toIcsDate(input.startsAt)}`,
    `DTEND:${toIcsDate(input.endsAt)}`,
    `ORGANIZER:mailto:${organizer}`,
    `ATTENDEE;RSVP=TRUE:mailto:${attendee}`,
    `SUMMARY:${escapeIcsText(`Cita en ${input.clinicName}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : null,
    `STATUS:${input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "CLASS:PRIVATE",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter((value): value is string => Boolean(value));

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
