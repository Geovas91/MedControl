import assert from "node:assert/strict";
import test from "node:test";
import { applyFollowUpToIntent, classifyContextualHelper, getDefaultSchedulingProfessional, getMissingFields, isConversationResetCommand, resolveConversationInput } from "../../lib/assistant/orchestration/conversation.ts";
import type { AssistantIntent } from "../../lib/assistant/orchestration/intents.ts";

const today = "2026-09-14";
const availability: AssistantIntent = { type: "check_availability", localDate: "2026-09-15", durationMinutes: 30 };

test("availability follow-up replaces the current professional query", () => {
  const first = resolveConversationInput(null, "Que horario tengo mañana", today);
  assert.equal(first.state, "parsed");
  if (first.state === "parsed" && first.result.state === "intent") {
    assert.equal(first.result.intent.type, "check_availability");
    const second = resolveConversationInput(first.result.intent, "Doctor 1 QA Norte", today);
    assert.equal(second.state, "parsed");
    if (second.state === "parsed" && second.result.state === "intent" && second.result.intent.type === "check_availability") assert.equal(second.result.intent.professionalQuery, "Doctor 1 QA Norte");
  }
});

test("a second professional follow-up replaces the first query", () => {
  const first = resolveConversationInput(availability, "Doctor 1 QA Norte", today);
  assert.equal(first.state, "parsed");
  if (first.state === "parsed" && first.result.state === "intent") {
    const second = resolveConversationInput(first.result.intent, "Doctor 3 QA Norte", today);
    assert.equal(second.state, "parsed");
    if (second.state === "parsed" && second.result.state === "intent" && second.result.intent.type === "check_availability") assert.equal(second.result.intent.professionalQuery, "Doctor 3 QA Norte");
  }
});

test("recognized intents replace pending availability and suggested prompts", () => {
  for (const input of ["Agendar una cita", "Ver citas de hoy", "Cancelar una cita", "Reprogramar una cita"]) {
    const result = resolveConversationInput(availability, input, today);
    assert.equal(result.state, "parsed");
    if (result.state === "parsed" && result.result.state === "intent") assert.notEqual(result.result.intent.type, "check_availability");
  }
  const create = resolveConversationInput(availability, "Agendar una cita", today);
  if (create.state === "parsed" && create.result.state === "intent") assert.equal(create.result.intent.type, "create_appointment");
});

test("reset commands clear conversational state without a mutation", () => {
  assert.equal(isConversationResetCommand("  Empezar   de nuevo "), true);
  assert.deepEqual(resolveConversationInput(availability, "Nueva consulta", today), { state: "reset" });
});

test("generic slot filling consumes date formats after professional resolution", () => {
  const intent: AssistantIntent = { type: "check_availability", professionalClinicMemberId: "member-1", localDate: undefined, durationMinutes: 30 };
  const first = applyFollowUpToIntent({ intent, message: "19 de septiembre de 2026", clinicLocalDate: today });
  assert.equal(first.consumed, true);
  assert.deepEqual(first.missingFields, []);
  if (first.updatedIntent.type === "check_availability") assert.equal(first.updatedIntent.localDate, "2026-09-19");
  assert.equal(getMissingFields(intent).includes("localDate"), true);
  const todayResult = applyFollowUpToIntent({ intent, message: "hoy", clinicLocalDate: today });
  if (todayResult.updatedIntent.type === "check_availability") assert.equal(todayResult.updatedIntent.localDate, today);
});

test("weekday-only input remains unconsumed when relative weekdays are unsupported", () => {
  const intent: AssistantIntent = { type: "check_availability", professionalClinicMemberId: "member-1", durationMinutes: 30 };
  const result = applyFollowUpToIntent({ intent, message: "Miércoles", clinicLocalDate: today });
  assert.equal(result.consumed, false);
  assert.deepEqual(result.missingFields, ["localDate"]);
});

test("generic slot filling consumes local time and entity queries", () => {
  const timeIntent: AssistantIntent = { type: "create_appointment", patientId: "patient-1", professionalClinicMemberId: "member-1", localDate: today, durationMinutes: 30 };
  const time = applyFollowUpToIntent({ intent: timeIntent, message: "10:30 am", clinicLocalDate: today });
  if (time.updatedIntent.type === "create_appointment") assert.equal(time.updatedIntent.localTime, "10:30");
  const patientIntent: AssistantIntent = { type: "create_appointment", professionalClinicMemberId: "member-1", localDate: today, localTime: "10:00", durationMinutes: 30 };
  const patient = applyFollowUpToIntent({ intent: patientIntent, message: "Juan Pérez", clinicLocalDate: today });
  if (patient.updatedIntent.type === "create_appointment") assert.equal(patient.updatedIntent.patientQuery, "Juan Pérez");
});

test("contextual helper commands do not become entity queries", () => {
  const create: AssistantIntent = { type: "create_appointment", localDate: today, localTime: "10:00", durationMinutes: 30 };
  assert.equal(classifyContextualHelper(create, "Dame la lista de pacientes"), "patients");
  assert.equal(classifyContextualHelper({ ...create, patientId: "patient-1" }, "Dame la lista de médicos"), "professionals");
  for (const command of ["Dame la lista de profesionales", "Qué profesionales hay", "Muéstrame médicos", "Ver médicos", "Cambiar profesional", "Elegir otro médico"]) {
    assert.equal(classifyContextualHelper({ ...create, patientId: "patient-1", professionalClinicMemberId: "member-1" }, command), "professionals");
  }
  assert.equal(classifyContextualHelper(create, "Juan Pérez"), null);
});

test("self scheduling defaults only to an active professional actor", () => {
  const context = { clinicMemberId: "member-1", isProfessional: true } as const;
  assert.equal(getDefaultSchedulingProfessional({ ...context, role: "doctor" }), "member-1");
  assert.equal(getDefaultSchedulingProfessional({ ...context, role: "owner" }), "member-1");
  assert.equal(getDefaultSchedulingProfessional({ ...context, role: "admin" }), "member-1");
  assert.equal(getDefaultSchedulingProfessional({ ...context, role: "assistant" }), null);
  assert.equal(getDefaultSchedulingProfessional({ ...context, isProfessional: false, role: "owner" }), null);
});

test("availability retry keeps patient and professional while replacing date and time", () => {
  const pending: AssistantIntent = {
    type: "create_appointment", patientId: "patient-1", professionalClinicMemberId: "member-1",
    localDate: "2026-09-17", localTime: "17:00", durationMinutes: 30
  };
  const result = resolveConversationInput({ ...pending, localDate: undefined, localTime: undefined }, "19 de septiembre a las 14:00", today);
  assert.equal(result.state, "parsed");
  if (result.state === "parsed" && result.result.state === "intent" && result.result.intent.type === "create_appointment") {
    assert.equal(result.result.intent.patientId, "patient-1");
    assert.equal(result.result.intent.professionalClinicMemberId, "member-1");
    assert.equal(result.result.intent.localDate, "2026-09-19");
    assert.equal(result.result.intent.localTime, "14:00");
  }
});
