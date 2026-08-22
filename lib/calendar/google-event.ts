import { createHash } from "node:crypto";

export type GoogleCalendarEventPayload = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  visibility: "private";
  transparency: "opaque";
  extendedProperties: { private: { clinicontrolAppointmentId: string } };
};

export function buildGoogleCalendarEventPayload(input: {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
}): GoogleCalendarEventPayload {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("Invalid appointment time range.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.appointmentId)) throw new Error("Invalid appointment id.");

  return {
    summary: "Cita CliniControl",
    description: "Evento generado por CliniControl. Consulta los detalles clínicos únicamente dentro de CliniControl.",
    start: { dateTime: start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: end.toISOString(), timeZone: input.timeZone },
    visibility: "private",
    transparency: "opaque",
    extendedProperties: { private: { clinicontrolAppointmentId: input.appointmentId } }
  };
}

export function isSafeGoogleEventId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isValidGoogleWritableEventId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-v]{5,1024}$/.test(value);
}

export function buildGoogleCalendarEventId(integrationId: string, appointmentId: string, generation = "initial") {
  const eventId = createHash("sha256").update(`${integrationId}:${appointmentId}:${generation}`, "utf8").digest("hex").slice(0, 32);
  if (!isValidGoogleWritableEventId(eventId)) throw new Error("Generated Google event id is invalid.");
  return eventId;
}

export function shouldSyncGoogleCalendarEvent(
  existing: { appointmentVersion: string; status: "pending" | "synced" | "deleted" | "failed" } | null,
  appointmentVersion: string,
  target: "synced" | "deleted"
) {
  return !existing || existing.appointmentVersion !== appointmentVersion || existing.status !== target;
}

export function classifyGoogleCalendarFailure(status: number) {
  if (status === 401) return "reconnect_required" as const;
  if (status === 404 || status === 410) return "event_missing" as const;
  if (status === 403 || status === 429 || status >= 500) return "temporary_failure" as const;
  return "permanent_failure" as const;
}
