import { isAllowedAppointmentDuration, isValidAppointmentTime } from "@/lib/appointments/create";
import { isCanonicalAppointmentDate, isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { parseDateExpression, parseTimeExpression } from "@/lib/assistant/parser/deterministic";
import type { AssistantIntent } from "./intents";
import type { AssistantStructuredChoice } from "./structured-selection";

export const DEFAULT_ASSISTANT_CONTEXT_TTL_SECONDS = 15 * 60;

export type AssistantConversationContext = {
  actorId: string;
  clinicId: string;
  activeIntent: AssistantIntent["type"] | null;
  focusedPatientRef?: string;
  focusedProfessionalRef?: string;
  focusedProfessionalUserRef?: string;
  focusedAppointmentRef?: string;
  localDate?: string;
  startTime?: string;
  durationMinutes?: number;
  selectedSlot?: { professionalRef: string; localDate: string; startTime: string; durationMinutes: number };
  availableSlotTimes?: string[];
  lastReadKind?: "patients" | "professionals" | "appointments" | "appointment" | "slots";
  lastResultCount?: number;
  updatedAt: number;
};

export type AssistantContextScope = { actorId: string; clinicId: string };
export type AssistantContextValidators = {
  patient(ref: string): Promise<boolean>;
  professional(ref: string): Promise<{ userId: string } | null>;
  appointment(ref: string): Promise<{ status: string } | null>;
  slot(slot: NonNullable<AssistantConversationContext["selectedSlot"]>): Promise<boolean>;
};

const intentTypes = new Set<AssistantIntent["type"]>([
  "search_patients", "search_appointments", "get_appointment", "get_professionals", "check_availability",
  "create_appointment", "confirm_appointment", "cancel_appointment", "reschedule_appointment"
]);

export function assistantContextTtlSeconds(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Math.min(3600, Math.max(60, Number(value))) : DEFAULT_ASSISTANT_CONTEXT_TTL_SECONDS;
}

export function newAssistantConversationContext(scope: AssistantContextScope, now = Date.now()): AssistantConversationContext {
  return { actorId: scope.actorId, clinicId: scope.clinicId, activeIntent: null, updatedAt: now };
}

function validContext(value: unknown): value is AssistantConversationContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const allowed = new Set(["actorId", "clinicId", "activeIntent", "focusedPatientRef", "focusedProfessionalRef", "focusedProfessionalUserRef", "focusedAppointmentRef", "localDate", "startTime", "durationMinutes", "selectedSlot", "availableSlotTimes", "lastReadKind", "lastResultCount", "updatedAt"]);
  if (Object.keys(row).some((key) => !allowed.has(key))) return false;
  if (typeof row.actorId !== "string" || typeof row.clinicId !== "string" || !isCanonicalAppointmentUuid(row.actorId) || !isCanonicalAppointmentUuid(row.clinicId)) return false;
  if (row.activeIntent !== null && !intentTypes.has(row.activeIntent as AssistantIntent["type"])) return false;
  for (const key of ["focusedPatientRef", "focusedProfessionalRef", "focusedProfessionalUserRef", "focusedAppointmentRef"]) {
    if (row[key] !== undefined && (typeof row[key] !== "string" || !isCanonicalAppointmentUuid(row[key]))) return false;
  }
  if (row.focusedProfessionalUserRef && !row.focusedProfessionalRef) return false;
  if (row.localDate !== undefined && (typeof row.localDate !== "string" || !isCanonicalAppointmentDate(row.localDate))) return false;
  if (row.startTime !== undefined && (typeof row.startTime !== "string" || !isValidAppointmentTime(row.startTime))) return false;
  if (row.durationMinutes !== undefined && (typeof row.durationMinutes !== "number" || !isAllowedAppointmentDuration(row.durationMinutes))) return false;
  if (row.availableSlotTimes !== undefined && (!Array.isArray(row.availableSlotTimes) || row.availableSlotTimes.length > 10 || row.availableSlotTimes.some((time) => typeof time !== "string" || !isValidAppointmentTime(time)))) return false;
  if (row.availableSlotTimes !== undefined && (!row.focusedProfessionalRef || !row.localDate)) return false;
  if (row.lastReadKind !== undefined && !["patients", "professionals", "appointments", "appointment", "slots"].includes(String(row.lastReadKind))) return false;
  if (row.lastResultCount !== undefined && (typeof row.lastResultCount !== "number" || !Number.isInteger(row.lastResultCount) || row.lastResultCount < 0 || row.lastResultCount > 100)) return false;
  if (typeof row.updatedAt !== "number" || !Number.isFinite(row.updatedAt)) return false;
  if (row.selectedSlot !== undefined) {
    const slot = row.selectedSlot;
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
    const fields = slot as Record<string, unknown>;
    if (Object.keys(fields).length !== 4 || !["professionalRef", "localDate", "startTime", "durationMinutes"].every((key) => key in fields)) return false;
    if (typeof fields.professionalRef !== "string" || !isCanonicalAppointmentUuid(fields.professionalRef) || typeof fields.localDate !== "string" || !isCanonicalAppointmentDate(fields.localDate) || typeof fields.startTime !== "string" || !isValidAppointmentTime(fields.startTime) || typeof fields.durationMinutes !== "number" || !isAllowedAppointmentDuration(fields.durationMinutes)) return false;
  }
  return true;
}

export function readAssistantConversationContext(raw: unknown, scope: AssistantContextScope, now = Date.now(), ttlSeconds = DEFAULT_ASSISTANT_CONTEXT_TTL_SECONDS) {
  if (!validContext(raw)) return { context: newAssistantConversationContext(scope, now), reason: "created" as const };
  if (raw.actorId !== scope.actorId || raw.clinicId !== scope.clinicId) return { context: newAssistantConversationContext(scope, now), reason: "scope_changed" as const };
  if (raw.updatedAt > now + 5000 || now - raw.updatedAt > ttlSeconds * 1000) return { context: newAssistantConversationContext(scope, now), reason: "expired" as const };
  return { context: { ...raw, updatedAt: now }, reason: "continued" as const };
}

export async function revalidateAssistantConversationContext(raw: unknown, scope: AssistantContextScope, validators: AssistantContextValidators, now = Date.now(), ttlSeconds = DEFAULT_ASSISTANT_CONTEXT_TTL_SECONDS) {
  const read = readAssistantConversationContext(raw, scope, now, ttlSeconds);
  let context = read.context;
  if (read.reason !== "continued") return read;
  let invalidated = false;
  if (context.focusedPatientRef && !await validators.patient(context.focusedPatientRef)) {
    context = { ...context, focusedPatientRef: undefined }; invalidated = true;
  }
  if (context.focusedProfessionalRef) {
    const professional = await validators.professional(context.focusedProfessionalRef);
    if (!professional) {
      context = { ...context, focusedProfessionalRef: undefined, focusedProfessionalUserRef: undefined, selectedSlot: undefined, startTime: undefined }; invalidated = true;
    } else context = { ...context, focusedProfessionalUserRef: professional.userId };
  }
  if (context.focusedAppointmentRef) {
    const appointment = await validators.appointment(context.focusedAppointmentRef);
    if (!appointment || appointment.status === "cancelled") {
      context = { ...context, focusedAppointmentRef: undefined }; invalidated = true;
    }
  }
  if (context.selectedSlot && (!context.focusedProfessionalRef || context.selectedSlot.professionalRef !== context.focusedProfessionalRef || context.selectedSlot.localDate !== context.localDate || !await validators.slot(context.selectedSlot))) {
    context = { ...context, selectedSlot: undefined, startTime: undefined }; invalidated = true;
  }
  return invalidated
    ? { context: newAssistantConversationContext(scope, now), reason: "invalidated" as const }
    : { context, reason: "continued" as const };
}

export function intentFromAssistantContext(context: AssistantConversationContext): AssistantIntent | null {
  const durationMinutes = context.durationMinutes ?? 30;
  switch (context.activeIntent) {
    case "search_patients": return { type: "search_patients", query: "" };
    case "get_professionals": return { type: "get_professionals" };
    case "search_appointments": return { type: "search_appointments", patientId: context.focusedPatientRef, professionalId: context.focusedProfessionalUserRef, localDate: context.localDate };
    case "get_appointment": return { type: "get_appointment", appointmentId: context.focusedAppointmentRef, localDate: context.localDate };
    case "check_availability": return { type: "check_availability", professionalClinicMemberId: context.focusedProfessionalRef, localDate: context.localDate, durationMinutes };
    case "create_appointment": return { type: "create_appointment", patientId: context.focusedPatientRef, professionalClinicMemberId: context.focusedProfessionalRef, localDate: context.localDate, localTime: context.startTime, durationMinutes };
    case "confirm_appointment": return { type: "confirm_appointment", appointmentId: context.focusedAppointmentRef };
    case "cancel_appointment": return { type: "cancel_appointment", appointmentId: context.focusedAppointmentRef };
    case "reschedule_appointment": return { type: "reschedule_appointment", appointmentId: context.focusedAppointmentRef, localDate: context.localDate, localTime: context.startTime, durationMinutes };
    default: return null;
  }
}

export function contextualAppointmentCommand(message: string, context: AssistantConversationContext): AssistantIntent | null {
  const plain = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!context.focusedAppointmentRef) return null;
  if (/^(?:cancelala|cancela esa|cancela la cita)$/.test(plain)) return { type: "cancel_appointment", appointmentId: context.focusedAppointmentRef };
  if (/^(?:confirmala|confirma esa|confirma la cita)$/.test(plain)) return { type: "confirm_appointment", appointmentId: context.focusedAppointmentRef };
  if (/^(?:cambiala|muevela|reprogramala)\s+a\s+las?\s+\d{1,2}(?::[0-5]\d)?(?:\s*(?:am|pm))?$/.test(plain)) {
    const shortAfternoon = /\ba las? ([1-8])$/.exec(plain);
    const time = shortAfternoon ? `${String(Number(shortAfternoon[1]) + 12).padStart(2, "0")}:00` : parseTimeExpression(message);
    if (time) return { type: "reschedule_appointment", appointmentId: context.focusedAppointmentRef, localDate: parseDateExpression(message, context.localDate ?? "") ?? context.localDate, localTime: time, durationMinutes: context.durationMinutes ?? 30 };
  }
  return null;
}

function contextualDate(message: string, today: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[?¿]/g, "").replace(/\s+/g, " ").trim();
  if (!/^(?:y\s+)?(?:(?:el|la de|para el)\s+)?(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?)$/.test(normalized)) return null;
  const relative = parseDateExpression(normalized, today);
  if (relative) return relative;
  const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const wanted = weekdays.findIndex((day) => normalized.endsWith(day));
  if (wanted < 0) return null;
  const date = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + (wanted - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}

export function contextualSchedulingFollowUp(message: string, context: AssistantConversationContext, today: string): AssistantIntent | null {
  const active = intentFromAssistantContext(context);
  if (!active) return null;
  const date = contextualDate(message, today);
  if (date && "localDate" in active) return { ...active, localDate: date, ...(active.type === "create_appointment" || active.type === "reschedule_appointment" ? { localTime: undefined } : {}) } as AssistantIntent;
  const plain = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if ((active.type === "create_appointment" || active.type === "reschedule_appointment") && /^(?:y\s+)?a\s+las?\s+\d{1,2}(?::[0-5]\d)?(?:\s*(?:am|pm))?$/.test(plain)) {
    const time = parseTimeExpression(message);
    if (time) return { ...active, localTime: time };
  }
  if (active.type === "create_appointment" && !active.patientId) {
    const patient = /^(?:para|con)\s+(.{2,100})$/i.exec(message.trim());
    if (patient && !/^(?:ese|esa)\s+paciente$/i.test(patient[1])) return { ...active, patientQuery: patient[1].trim() };
  }
  if (active.type === "check_availability" && context.focusedProfessionalRef && context.localDate && context.availableSlotTimes?.length) {
    const match = /^(?:el|la)\s+de\s+las?\s+(\d{1,2}(?::[0-5]\d)?)$/.exec(plain);
    const time = match ? parseTimeExpression(`a las ${match[1]}`) : null;
    if (time && context.availableSlotTimes.filter((available) => available === time).length === 1) return { type: "create_appointment", professionalClinicMemberId: context.focusedProfessionalRef, localDate: context.localDate, localTime: time, durationMinutes: context.durationMinutes ?? 30 };
  }
  if (active.type === "create_appointment" && context.focusedPatientRef && /^(?:para|con)\s+ese\s+paciente$/.test(plain)) return active;
  if ((active.type === "create_appointment" || active.type === "check_availability") && context.focusedProfessionalRef && /^(?:ese|con ese)\s+doctor$/.test(plain)) return active;
  return null;
}

export function ambiguousAppointmentRequest(message: string, context: AssistantConversationContext): AssistantIntent | null {
  if (context.focusedAppointmentRef || context.lastReadKind !== "appointments" || (context.lastResultCount ?? 0) < 2) return null;
  const plain = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!/^(?:cancela|cancelar|confirmar|confirma|cambiala|reprograma)\s+(?:esa|la cita)$/.test(plain)) return null;
  if (plain.startsWith("cancel")) return { type: "cancel_appointment" };
  if (plain.startsWith("confirm")) return { type: "confirm_appointment" };
  return { type: "reschedule_appointment", durationMinutes: 30 };
}

/** Call only after the structured choice has passed the authenticated server resolver. */
export function applyVerifiedAssistantChoiceToContext(context: AssistantConversationContext, choice: AssistantStructuredChoice): AssistantConversationContext {
  if (choice.kind === "patient") return { ...context, focusedPatientRef: choice.reference };
  if (choice.kind === "professional") return { ...context, focusedProfessionalRef: choice.reference, focusedProfessionalUserRef: undefined, focusedAppointmentRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
  if (choice.kind === "appointment") return { ...context, focusedAppointmentRef: choice.reference, focusedPatientRef: undefined, focusedProfessionalRef: undefined, focusedProfessionalUserRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
  return { ...context, focusedProfessionalRef: choice.professionalReference, focusedAppointmentRef: undefined, localDate: choice.localDate, startTime: choice.startTime, durationMinutes: choice.durationMinutes, selectedSlot: { professionalRef: choice.professionalReference, localDate: choice.localDate, startTime: choice.startTime, durationMinutes: choice.durationMinutes } };
}

export function updateAssistantConversationContext(context: AssistantConversationContext, intent: AssistantIntent | null, result: {
  state: string; intent?: AssistantIntent; field?: string; choices?: unknown[]; patients?: Array<{ id: string }>;
  professionals?: Array<{ id: string }>; appointments?: Array<{ id: string; startsAt: string }>;
  appointment?: { id: string; startsAt: string }; professionalClinicMemberId?: string; date?: string; durationMinutes?: number;
  resolvedPatientRef?: string; resolvedProfessionalRef?: string; resolvedAppointmentRef?: string; uniqueVerified?: boolean;
  slots?: unknown[];
}, timeZone: string): AssistantConversationContext {
  let next = { ...context };
  if (result.state === "error" || result.state === "proposal_terminal") return next;
  if (intent) {
    if (intent.type !== next.activeIntent && intent.type !== "create_appointment") next = { ...next, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    next.activeIntent = intent.type;
    if ("patientQuery" in intent && intent.patientQuery) next.focusedPatientRef = undefined;
    if ("professionalQuery" in intent && intent.professionalQuery) next = { ...next, focusedProfessionalRef: undefined, focusedProfessionalUserRef: undefined, focusedAppointmentRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    if ("appointmentQuery" in intent && intent.appointmentQuery) next.focusedAppointmentRef = undefined;
    const patient = "patientId" in intent ? intent.patientId : undefined;
    const professional = "professionalClinicMemberId" in intent ? intent.professionalClinicMemberId : undefined;
    const appointment = "appointmentId" in intent ? intent.appointmentId : undefined;
    const date = "localDate" in intent ? intent.localDate : undefined;
    const time = "localTime" in intent ? intent.localTime : undefined;
    if (patient && patient !== next.focusedPatientRef) next.focusedPatientRef = patient;
    if (professional && professional !== next.focusedProfessionalRef) next = { ...next, focusedProfessionalRef: professional, focusedProfessionalUserRef: undefined, focusedAppointmentRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    if (appointment && appointment !== next.focusedAppointmentRef) next = { ...next, focusedAppointmentRef: appointment, focusedPatientRef: undefined, focusedProfessionalRef: undefined, focusedProfessionalUserRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    if (date && date !== next.localDate) next = { ...next, localDate: date, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    if (time) { if (time !== next.startTime) next.selectedSlot = undefined; next.startTime = time; }
    if ("durationMinutes" in intent && intent.durationMinutes) next.durationMinutes = intent.durationMinutes;
  }
  if (result.intent) next = updateAssistantConversationContext(next, result.intent, { state: "message" }, timeZone);
  if (result.resolvedPatientRef) next.focusedPatientRef = result.resolvedPatientRef;
  if (result.resolvedProfessionalRef) next.focusedProfessionalRef = result.resolvedProfessionalRef;
  if (result.resolvedAppointmentRef) next.focusedAppointmentRef = result.resolvedAppointmentRef;
  if (result.state === "choices") {
    if (result.field === "appointment") next.focusedAppointmentRef = undefined;
    if (result.field === "professional") next = { ...next, focusedProfessionalRef: undefined, focusedProfessionalUserRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    if (result.field === "patient") next.focusedPatientRef = undefined;
  }
  if (result.state === "slots" && result.professionalClinicMemberId && result.date) next = { ...next, focusedProfessionalRef: result.professionalClinicMemberId, focusedAppointmentRef: undefined, localDate: result.date, durationMinutes: result.durationMinutes ?? next.durationMinutes, selectedSlot: undefined, startTime: undefined, availableSlotTimes: Array.isArray(result.slots) ? result.slots.slice(0, 10).map((slot) => slot && typeof slot === "object" ? (slot as Record<string, unknown>).start : undefined).filter((time): time is string => typeof time === "string" && isValidAppointmentTime(time)) : undefined };
  if (result.state === "patients" || result.state === "professionals" || result.state === "appointments" || result.state === "appointment" || result.state === "slots") {
    const count = result.state === "appointment" ? 1 : result.state === "slots" ? result.slots?.length ?? 0 : result.state === "patients" ? result.patients?.length ?? 0 : result.state === "professionals" ? result.professionals?.length ?? 0 : result.appointments?.length ?? 0;
    next.lastReadKind = result.state;
    next.lastResultCount = count;
    if (result.state === "patients") next.focusedPatientRef = count === 1 ? result.patients?.[0].id : undefined;
    if (result.state === "professionals") next.focusedProfessionalRef = count === 1 ? result.professionals?.[0].id : undefined;
    if (result.state === "appointments") {
      next.focusedAppointmentRef = count === 1 && result.uniqueVerified === true ? result.appointments?.[0].id : undefined;
      if (result.resolvedPatientRef) next.focusedPatientRef = result.resolvedPatientRef;
    }
    if (result.state === "appointment" && result.appointment?.id !== next.focusedAppointmentRef) next = { ...next, focusedAppointmentRef: result.appointment?.id, focusedPatientRef: undefined, focusedProfessionalRef: undefined, focusedProfessionalUserRef: undefined, selectedSlot: undefined, availableSlotTimes: undefined, startTime: undefined };
    const startsAt = result.state === "appointment" ? result.appointment?.startsAt : result.state === "appointments" && count === 1 && result.uniqueVerified === true ? result.appointments?.[0].startsAt : undefined;
    if (startsAt) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(startsAt));
      const value = (part: "year" | "month" | "day") => parts.find((item) => item.type === part)?.value ?? "";
      next.localDate = `${value("year")}-${value("month")}-${value("day")}`;
    }
  }
  return next;
}
