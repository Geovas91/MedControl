import { isAllowedAppointmentDuration } from "@/lib/appointments/create";
import { appointmentStatuses, isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { parseDateExpression, parseTimeExpression } from "@/lib/assistant/parser/deterministic";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";

export const plannerIntents = ["search_patients", "search_appointments", "check_availability", "create_appointment", "confirm_appointment", "reschedule_appointment", "cancel_appointment", "unknown"] as const;
export const readPlannerIntents = [...plannerIntents, "get_appointment", "get_professionals"] as const;
export type AssistantIntentDraft = {
  intent: (typeof readPlannerIntents)[number];
  patientQuery: string | null;
  professionalQuery: string | null;
  appointmentQuery: string | null;
  date: string | null;
  time: string | null;
  duration: number | null;
  dateRange?: "upcoming" | null;
  status?: (typeof appointmentStatuses)[number] | null;
};

export const plannerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "patientQuery", "professionalQuery", "appointmentQuery", "date", "time", "duration"],
  properties: {
    intent: { type: "string", enum: plannerIntents },
    patientQuery: { type: ["string", "null"] },
    professionalQuery: { type: ["string", "null"] },
    appointmentQuery: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    time: { type: ["string", "null"] },
    duration: { type: ["integer", "null"] }
  }
} as const;

export const readPlannerSchema = {
  ...plannerSchema,
  required: [...plannerSchema.required, "dateRange", "status"],
  properties: {
    ...plannerSchema.properties,
    intent: { type: "string", enum: readPlannerIntents },
    dateRange: { type: ["string", "null"], enum: ["upcoming", null] },
    status: { type: ["string", "null"], enum: [...appointmentStatuses, null] }
  }
} as const;

const keys = Object.keys(plannerSchema.properties);
const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
function parseReadDate(value: string, today: string) {
  const parsed = parseDateExpression(value, today);
  if (parsed) return parsed;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const match = /^(?:(el|este|proximo)\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)$/.exec(normalized);
  if (!match) return null;
  const day = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  let offset = (weekdays.indexOf(match[2]) - day.getUTCDay() + 7) % 7;
  if (match[1] === "proximo" && offset === 0) offset = 7;
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}
function safeQuery(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim().length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value) && !isCanonicalAppointmentUuid(value.trim()));
}

export function parseAssistantIntentDraft(value: unknown, readToolsEnabled = false): AssistantIntentDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const expectedKeys = readToolsEnabled ? Object.keys(readPlannerSchema.properties) : keys;
  if (Object.keys(draft).length !== expectedKeys.length || expectedKeys.some((key) => !(key in draft))) return null;
  if (!(readToolsEnabled ? readPlannerIntents : plannerIntents).some((intent) => intent === draft.intent)) return null;
  if (readToolsEnabled && (draft.dateRange !== null && draft.dateRange !== "upcoming" || draft.status !== null && !appointmentStatuses.some((status) => status === draft.status))) return null;
  if (readToolsEnabled && (draft.dateRange === "upcoming" && (draft.intent !== "search_appointments" || draft.date !== null) || draft.status !== null && draft.intent !== "search_appointments")) return null;
  if (!["patientQuery", "professionalQuery", "appointmentQuery"].every((key) => safeQuery(draft[key]))) return null;
  if (draft.date !== null && (typeof draft.date !== "string" || draft.date.length > 40)) return null;
  if (draft.time !== null && (typeof draft.time !== "string" || draft.time.length > 20)) return null;
  if (draft.duration !== null && (typeof draft.duration !== "number" || !isAllowedAppointmentDuration(draft.duration))) return null;
  return draft as AssistantIntentDraft;
}

export function intentFromDraft(draft: AssistantIntentDraft, today: string, pending: AssistantIntent | null): AssistantIntent | null {
  if (draft.intent === "unknown") return null;
  const same = pending?.type === draft.intent ? pending : null;
  const date = draft.date ? (draft.dateRange === undefined ? parseDateExpression(draft.date, today) : parseReadDate(draft.date, today)) : undefined;
  const time = draft.time ? parseTimeExpression(`a las ${draft.time}`) : undefined;
  if ((draft.date && !date) || (draft.time && !time)) return null;
  const durationMinutes = draft.duration ?? (same && "durationMinutes" in same ? same.durationMinutes : 30);
  const patientQuery = draft.patientQuery?.trim() || undefined;
  const professionalQuery = draft.professionalQuery?.trim() || undefined;
  const appointmentQuery = draft.appointmentQuery?.trim() || undefined;
  switch (draft.intent) {
    case "search_patients": return { type: "search_patients", query: patientQuery ?? "" };
    case "search_appointments": return draft.dateRange === undefined
      ? { type: "search_appointments", query: appointmentQuery, localDate: date ?? undefined }
      : { type: "search_appointments", query: appointmentQuery, patientQuery, professionalQuery, localDate: date ?? undefined, period: draft.dateRange ?? undefined, status: draft.status ?? undefined };
    case "get_appointment": return { type: "get_appointment", appointmentQuery: appointmentQuery ?? (same?.type === "get_appointment" ? same.appointmentQuery : undefined), appointmentId: appointmentQuery ? undefined : (same?.type === "get_appointment" ? same.appointmentId : undefined), professionalQuery: professionalQuery ?? (same?.type === "get_appointment" ? same.professionalQuery : undefined), professionalId: professionalQuery ? undefined : (same?.type === "get_appointment" ? same.professionalId : undefined), localDate: date ?? (same?.type === "get_appointment" ? same.localDate : undefined) };
    case "get_professionals": return { type: "get_professionals", professionalQuery };
    case "check_availability": return { type: "check_availability", professionalQuery: professionalQuery ?? (same?.type === "check_availability" ? same.professionalQuery : undefined), professionalClinicMemberId: professionalQuery ? undefined : (same?.type === "check_availability" ? same.professionalClinicMemberId : undefined), localDate: date ?? (same?.type === "check_availability" ? same.localDate : undefined), durationMinutes };
    case "create_appointment": return { type: "create_appointment", patientQuery: patientQuery ?? (same?.type === "create_appointment" ? same.patientQuery : undefined), patientId: patientQuery ? undefined : (same?.type === "create_appointment" ? same.patientId : undefined), professionalQuery: professionalQuery ?? (same?.type === "create_appointment" ? same.professionalQuery : undefined), professionalClinicMemberId: professionalQuery ? undefined : (same?.type === "create_appointment" ? same.professionalClinicMemberId : undefined), localDate: date ?? (same?.type === "create_appointment" ? same.localDate : undefined), localTime: time ?? (same?.type === "create_appointment" ? same.localTime : undefined), durationMinutes };
    case "confirm_appointment":
    case "cancel_appointment": return { type: draft.intent, appointmentQuery: appointmentQuery ?? (same && "appointmentQuery" in same ? same.appointmentQuery : undefined), appointmentId: appointmentQuery ? undefined : (same && "appointmentId" in same ? same.appointmentId : undefined) };
    case "reschedule_appointment": return { type: "reschedule_appointment", appointmentQuery: appointmentQuery ?? (same?.type === "reschedule_appointment" ? same.appointmentQuery : undefined), appointmentId: appointmentQuery ? undefined : (same?.type === "reschedule_appointment" ? same.appointmentId : undefined), localDate: date ?? (same?.type === "reschedule_appointment" ? same.localDate : undefined), localTime: time ?? (same?.type === "reschedule_appointment" ? same.localTime : undefined), durationMinutes };
  }
}
