import type { AppointmentIcsMethod } from "./ics";

export type CalendarOperationReason = "created" | "rescheduled" | "cancelled" | "restored";

export function hasAppointmentCalendarRelevantChange(
  original: { doctorId: string | null; startsAt: string; endsAt: string; location: string | null },
  next: { doctorId: string | null; startsAt: string; endsAt: string; location: string | null }
) {
  return Date.parse(original.startsAt) !== Date.parse(next.startsAt)
    || Date.parse(original.endsAt) !== Date.parse(next.endsAt)
    || original.doctorId !== next.doctorId
    || original.location !== next.location;
}

export function getStatusCalendarOperation(outcome: string): { method: AppointmentIcsMethod; reason: CalendarOperationReason } | null {
  if (outcome === "cancelled") return { method: "CANCEL", reason: "cancelled" };
  if (outcome === "restored") return { method: "REQUEST", reason: "restored" };
  return null;
}

export function prepareCalendarInvitationState(
  existing: { sequence: number; operationKey: string } | null,
  operationKey: string
) {
  if (existing?.operationKey === operationKey) {
    return { sequence: existing.sequence, operationKey, shouldSend: false };
  }
  return {
    sequence: existing ? existing.sequence + 1 : 0,
    operationKey,
    shouldSend: true
  };
}
