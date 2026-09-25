import { matchesAssistantQuery } from "@/lib/assistant/parser/deterministic";
import { isAllowedAppointmentDuration } from "@/lib/appointments/create";
import { appointmentStatuses, isCanonicalAppointmentDate, isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import type { AssistantIntent } from "./intents";

export type AssistantReadToolName = "search_patients" | "search_appointments" | "get_appointment" | "get_available_slots" | "get_professionals";
export type AssistantReadIntent = Extract<AssistantIntent, { type: "search_patients" | "search_appointments" | "get_appointment" | "check_availability" | "get_professionals" }>;
type ToolResult = { ok: true; data: unknown } | { ok: false; error: { code: string; safeMessage: string } };
type ReadTool = (name: AssistantReadToolName, input: unknown) => Promise<ToolResult>;
type ToolEvent = "read_tool_selected" | "read_tool_success" | "read_tool_failed";
type Observe = (event: ToolEvent, context: { tool_category: AssistantReadToolName; result_count?: number; latency_ms?: number; error_code?: string }) => void;

export type AssistantReadResponse =
  | { state: "message"; message: string; intent?: AssistantIntent }
  | { state: "error"; message: string }
  | { state: "choices"; message: string; field: "patient" | "professional" | "appointment"; choices: Array<{ id: string; label: string }> }
  | { state: "patients"; patients: Array<{ id: string; name: string }>; hasMore?: boolean }
  | { state: "professionals"; professionals: Array<{ name: string }>; hasMore?: boolean }
  | { state: "appointments"; appointments: Array<{ id: string; patient: string; professional: string | null; startsAt: string; endsAt: string; status: string }>; hasMore?: boolean }
  | { state: "appointment"; appointment: { id: string; patient: string; professional: string | null; startsAt: string; endsAt: string; status: string } }
  | { state: "slots"; professional: string; date: string; slots: Array<{ start: string; end: string }>; hasMore?: boolean };

type Patient = { patient_id: string; display_name: string };
type Professional = { professional_clinic_member_id: string; professional_user_id: string; display_name: string };
type Appointment = { appointment_id: string; patient_id: string | null; patient_display_name: string; professional_id: string | null; professional_display_name: string | null; starts_at: string; ends_at: string; status: string };
type Slot = { local_start: string; local_end: string };
const MAX_RESULTS = 10;
const failureMessage = "No fue posible consultar la agenda. Intenta de nuevo.";
const failed: AssistantReadResponse = { state: "error", message: failureMessage };
const safeCodes = new Set(["forbidden", "not_found", "conflict", "outside_availability", "stale", "invalid_transition", "validation_error", "entitlement", "ambiguous", "confirmation_required", "generic"]);

export function isAssistantReadIntent(intent: AssistantIntent): intent is AssistantReadIntent {
  return intent.type === "search_patients" || intent.type === "search_appointments" || intent.type === "get_appointment" || intent.type === "check_availability" || intent.type === "get_professionals";
}

export function shouldOrchestrateAssistantReads(llmEnabled: boolean, readToolsEnabled: boolean) {
  return llmEnabled && readToolsEnabled;
}

export function isValidAssistantReadIntent(intent: AssistantReadIntent) {
  const text = (value: unknown, empty = false) => typeof value === "string" && value.length <= 100 && (empty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value);
  const optionalText = (value: unknown) => value === undefined || text(value);
  const optionalId = (value: unknown) => value === undefined || typeof value === "string" && isCanonicalAppointmentUuid(value);
  const optionalDate = (value: unknown) => value === undefined || typeof value === "string" && isCanonicalAppointmentDate(value);
  if (intent.type === "search_patients") return text(intent.query, true);
  if (intent.type === "get_professionals") return optionalText(intent.professionalQuery);
  if (intent.type === "check_availability") return optionalText(intent.professionalQuery) && optionalId(intent.professionalClinicMemberId) && optionalDate(intent.localDate) && isAllowedAppointmentDuration(intent.durationMinutes);
  if (intent.type === "get_appointment") return optionalText(intent.appointmentQuery) && optionalId(intent.appointmentId) && optionalText(intent.professionalQuery) && optionalId(intent.professionalId) && optionalDate(intent.localDate);
  return optionalText(intent.query) && optionalText(intent.patientQuery) && optionalId(intent.patientId) && optionalText(intent.professionalQuery) && optionalId(intent.professionalId) && optionalDate(intent.localDate) && (intent.period === undefined || intent.period === "upcoming") && (intent.status === undefined || appointmentStatuses.some((status) => status === intent.status));
}

function limited<T>(rows: T[]) { return { rows: rows.slice(0, MAX_RESULTS), hasMore: rows.length > MAX_RESULTS }; }
function arrayData<T>(result: ToolResult): T[] | null { return result.ok && Array.isArray(result.data) ? result.data as T[] : null; }
function appointmentView(row: Appointment) {
  return { id: row.appointment_id, patient: row.patient_display_name, professional: row.professional_display_name, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status };
}

export async function orchestrateAssistantReadIntent(intent: AssistantReadIntent, {
  readTool, today, timeZone = "America/Mexico_City", defaultProfessionalClinicMemberId = null, observe = () => {}
}: { readTool: ReadTool; today: string; timeZone?: string; defaultProfessionalClinicMemberId?: string | null; observe?: Observe }): Promise<AssistantReadResponse> {
  async function call(name: AssistantReadToolName, input: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    observe("read_tool_selected", { tool_category: name });
    try {
      const result = await readTool(name, input);
      observe(result.ok ? "read_tool_success" : "read_tool_failed", {
        tool_category: name, result_count: result.ok ? Array.isArray(result.data) ? result.data.length : 1 : 0,
        latency_ms: Date.now() - startedAt,
        ...(!result.ok ? { error_code: safeCodes.has(result.error.code) ? result.error.code : "unknown" } : {})
      });
      return result;
    } catch {
      observe("read_tool_failed", { tool_category: name, result_count: 0, latency_ms: Date.now() - startedAt, error_code: "unknown" });
      return { ok: false, error: { code: "generic", safeMessage: failureMessage } };
    }
  }

  async function professionals() {
    const result = await call("get_professionals", {});
    return arrayData<Professional>(result);
  }

  async function resolveProfessional(query: string | undefined, selectedId: string | undefined, kind: "member" | "user") {
    const rows = await professionals();
    if (!rows) return { state: "error" as const, response: failed };
    const matches = selectedId
      ? rows.filter((row) => (kind === "member" ? row.professional_clinic_member_id : row.professional_user_id) === selectedId)
      : rows.filter((row) => query && matchesAssistantQuery(row.display_name, query));
    if (!matches.length) return { state: "none" as const, response: { state: "message", message: "No encontré ese profesional en la clínica activa." } satisfies AssistantReadResponse };
    if (rows.length >= 25 && matches.length === 1 && !selectedId) return { state: "ambiguous" as const, response: { state: "message", message: "Hay más profesionales; refina la búsqueda para elegir uno sin confusiones." } satisfies AssistantReadResponse };
    if (matches.length > 1) return { state: "ambiguous" as const, response: { state: "choices", field: "professional", message: "Encontré varios profesionales. Elige uno o refina la búsqueda.", choices: limited(matches).rows.map((row) => ({ id: kind === "member" ? row.professional_clinic_member_id : row.professional_user_id, label: row.display_name })) } satisfies AssistantReadResponse };
    return { state: "ready" as const, professional: matches[0] };
  }

  async function resolvePatient(query: string) {
    const result = await call("search_patients", { query });
    const rows = arrayData<Patient>(result);
    if (!rows) return { state: "error" as const, response: failed };
    if (!rows.length) return { state: "none" as const, response: { state: "message", message: "No encontré ese paciente en la clínica activa." } satisfies AssistantReadResponse };
    if (rows.length > 1) return { state: "ambiguous" as const, response: { state: "choices", field: "patient", message: "Encontré varios pacientes. Elige uno o refina la búsqueda.", choices: limited(rows).rows.map((row) => ({ id: row.patient_id, label: row.display_name })) } satisfies AssistantReadResponse };
    return { state: "ready" as const, patientId: rows[0].patient_id };
  }

  if (intent.type === "search_patients") {
    const result = await call("search_patients", { query: intent.query });
    const rows = arrayData<Patient>(result);
    if (!rows) return failed;
    const list = limited(rows);
    return { state: "patients", patients: list.rows.map((row) => ({ id: row.patient_id, name: row.display_name })), hasMore: list.hasMore };
  }

  if (intent.type === "get_professionals") {
    const rows = await professionals();
    if (!rows) return failed;
    const matches = intent.professionalQuery ? rows.filter((row) => matchesAssistantQuery(row.display_name, intent.professionalQuery!)) : rows;
    const list = limited(matches);
    return { state: "professionals", professionals: list.rows.map((row) => ({ name: row.display_name })), hasMore: list.hasMore };
  }

  if (intent.type === "check_availability") {
    const memberId = intent.professionalClinicMemberId ?? (!intent.professionalQuery ? defaultProfessionalClinicMemberId : null);
    if (!memberId && !intent.professionalQuery) return { state: "message", message: "¿De qué profesional quieres consultar la disponibilidad?", intent };
    const resolved = await resolveProfessional(intent.professionalQuery, memberId ?? undefined, "member");
    if (resolved.state !== "ready") return resolved.response;
    if (!intent.localDate) return { state: "message", message: "Necesito una fecha específica, por ejemplo 'mañana'.", intent: { ...intent, professionalClinicMemberId: resolved.professional.professional_clinic_member_id, professionalQuery: undefined } };
    const result = await call("get_available_slots", { professionalClinicMemberId: resolved.professional.professional_clinic_member_id, date: intent.localDate, durationMinutes: intent.durationMinutes });
    const rows = arrayData<Slot>(result);
    if (!rows) return failed;
    if (!rows.length) return { state: "message", message: "No encontré horarios disponibles para esa fecha.", intent };
    const list = limited(rows);
    return { state: "slots", professional: resolved.professional.display_name, date: intent.localDate, slots: list.rows.map((row) => ({ start: row.local_start, end: row.local_end })), hasMore: list.hasMore };
  }

  if (intent.type === "search_appointments" || intent.type === "get_appointment") {
    if (intent.type === "get_appointment" && intent.appointmentId) {
      const result = await call("get_appointment", { appointmentId: intent.appointmentId });
      return result.ok && result.data && !Array.isArray(result.data) ? { state: "appointment", appointment: appointmentView(result.data as Appointment) } : failed;
    }
    if (intent.type === "get_appointment" && !intent.localDate) return { state: "message", message: "Indica la fecha de la cita para buscarla sin confusiones.", intent };
    let patientId = intent.type === "search_appointments" ? intent.patientId : undefined;
    if (intent.type === "search_appointments" && !patientId && intent.patientQuery) {
      const resolved = await resolvePatient(intent.patientQuery);
      if (resolved.state !== "ready") return resolved.response;
      patientId = resolved.patientId;
    }
    let professionalId = intent.professionalId;
    if (intent.professionalQuery || professionalId) {
      const resolved = await resolveProfessional(intent.professionalQuery, professionalId, "user");
      if (resolved.state !== "ready") return resolved.response;
      professionalId = resolved.professional.professional_user_id;
    }
    const result = await call("search_appointments", {
      ...(patientId ? { patientId } : {}), ...(professionalId ? { professionalId } : {}),
      date: intent.localDate ?? today,
      ...(intent.type === "search_appointments" && intent.period === "upcoming" ? { period: "upcoming" } : {}),
      ...(intent.type === "search_appointments" && intent.status ? { status: intent.status } : {})
    });
    const rows = arrayData<Appointment>(result);
    if (!rows) return failed;
    const query = intent.type === "search_appointments" ? intent.query : intent.appointmentQuery;
    const matches = query ? rows.filter((row) => matchesAssistantQuery(`${row.patient_display_name} ${row.professional_display_name ?? ""}`, query)) : rows;
    if (intent.type === "search_appointments") {
      const list = limited(matches);
      return { state: "appointments", appointments: list.rows.map(appointmentView), hasMore: list.hasMore };
    }
    if (!matches.length) return { state: "message", message: "No encontré una cita que coincida en la clínica activa." };
    if (rows.length >= 25 && matches.length === 1) return { state: "message", message: "Hay más citas; refina la búsqueda para identificar una sola." };
    if (matches.length > 1) return { state: "choices", field: "appointment", message: "Encontré varias citas. Elige una o refina la búsqueda.", choices: limited(matches).rows.map((row) => ({ id: row.appointment_id, label: `${row.patient_display_name} · ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(row.starts_at))}` })) };
    const detail = await call("get_appointment", { appointmentId: matches[0].appointment_id });
    return detail.ok && detail.data && !Array.isArray(detail.data) ? { state: "appointment", appointment: appointmentView(detail.data as Appointment) } : failed;
  }
  return failed;
}
