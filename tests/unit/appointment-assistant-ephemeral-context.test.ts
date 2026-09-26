import assert from "node:assert/strict";
import test from "node:test";
import { ambiguousAppointmentRequest, applyVerifiedAssistantChoiceToContext, assistantContextTtlSeconds, contextualAppointmentCommand, contextualSchedulingFollowUp, intentFromAssistantContext, newAssistantConversationContext, readAssistantConversationContext, revalidateAssistantConversationContext, updateAssistantConversationContext, type AssistantContextValidators } from "../../lib/assistant/orchestration/context.ts";
import { planAssistantConversation } from "../../lib/assistant/llm/planner.ts";
import { runGatedAssistantPlanner } from "../../lib/assistant/llm/gated-planner.ts";
import type { PlannerContext } from "../../lib/assistant/llm/types.ts";

const scope = { actorId: "11111111-1111-4111-8111-111111111111", clinicId: "22222222-2222-4222-8222-222222222222" };
const otherScope = { actorId: "33333333-3333-4333-8333-333333333333", clinicId: "44444444-4444-4444-8444-444444444444" };
const patient = "55555555-5555-4555-8555-555555555555";
const doctor2 = "66666666-6666-4666-8666-666666666666";
const doctor3 = "77777777-7777-4777-8777-777777777777";
const appointment = "88888888-8888-4888-8888-888888888888";
const timeZone = "America/Mexico_City";
const now = 1_790_000_000_000;
const blank = () => newAssistantConversationContext(scope, now);
const validators = (overrides: Partial<AssistantContextValidators> = {}): AssistantContextValidators => ({
  patient: async (ref) => ref === patient,
  professional: async (ref) => ref === doctor2 || ref === doctor3 ? { userId: scope.actorId } : null,
  appointment: async (ref) => ref === appointment ? { status: "scheduled" } : null,
  slot: async () => true,
  ...overrides
});

test("context is bounded, expires after 15 minutes, and resets on clinic or actor change", async () => {
  const original = { ...blank(), activeIntent: "check_availability" as const, focusedProfessionalRef: doctor2 };
  assert.equal(assistantContextTtlSeconds(undefined), 900);
  assert.equal(readAssistantConversationContext(original, scope, now + 899_000).reason, "continued");
  assert.equal(readAssistantConversationContext(original, scope, now + 901_000).reason, "expired");
  assert.equal(readAssistantConversationContext(original, { ...scope, clinicId: otherScope.clinicId }, now).reason, "scope_changed");
  assert.equal(readAssistantConversationContext(original, { ...scope, actorId: otherScope.actorId }, now).reason, "scope_changed");
  assert.equal(readAssistantConversationContext({ ...original, rawMessage: "never stored" }, scope, now).reason, "created");
  assert.equal(readAssistantConversationContext({ ...blank(), focusedProfessionalUserRef: otherScope.actorId }, scope, now).reason, "created");
  let validations = 0;
  const expired = await revalidateAssistantConversationContext(original, scope, validators({ professional: async () => { validations++; return { userId: scope.actorId }; } }), now + 901_000);
  assert.equal(expired.context.focusedProfessionalRef, undefined);
  assert.equal(validations, 0);
});

test("A: availability keeps the resolved doctor when only the day changes", () => {
  const first = updateAssistantConversationContext(blank(), { type: "check_availability", professionalClinicMemberId: doctor2, localDate: "2026-09-28", durationMinutes: 30 }, { state: "slots", professionalClinicMemberId: doctor2, date: "2026-09-28", durationMinutes: 30, slots: [{ start: "10:30" }] }, timeZone);
  const second = contextualSchedulingFollowUp("y el martes?", first, "2026-09-25");
  assert.equal(second?.type, "check_availability");
  if (second?.type === "check_availability") {
    assert.equal(second.professionalClinicMemberId, doctor2);
    assert.equal(second.localDate, "2026-09-29");
  }
});

test("B: appointment search preserves the server-resolved patient across a date follow-up", () => {
  const first = updateAssistantConversationContext(blank(), { type: "search_appointments", patientQuery: "QA Patient N-D1-01" }, { state: "appointments", appointments: [{ id: appointment, startsAt: "2026-09-25T16:00:00Z" }, { id: otherScope.actorId, startsAt: "2026-09-25T17:00:00Z" }], resolvedPatientRef: patient }, timeZone);
  assert.equal(first.focusedAppointmentRef, undefined);
  assert.equal(first.focusedPatientRef, patient);
  const next = contextualSchedulingFollowUp("y mañana?", first, "2026-09-25");
  assert.equal(next?.type, "search_appointments");
  if (next?.type === "search_appointments") { assert.equal(next.patientId, patient); assert.equal(next.localDate, "2026-09-26"); }
});

test("a list never chooses the first professional; an unambiguous result or verified click does", () => {
  const many = updateAssistantConversationContext(blank(), { type: "get_professionals" }, { state: "professionals", professionals: [{ id: doctor2 }, { id: doctor3 }] }, timeZone);
  assert.equal(many.focusedProfessionalRef, undefined);
  const clicked = applyVerifiedAssistantChoiceToContext(many, { kind: "professional", label: "QA Doctor 2", reference: doctor2 });
  assert.equal(clicked.focusedProfessionalRef, doctor2);
  const unique = updateAssistantConversationContext(blank(), { type: "get_professionals" }, { state: "professionals", professionals: [{ id: doctor3 }] }, timeZone);
  assert.equal(unique.focusedProfessionalRef, doctor3);
});

test("C-D: verified slot choice preserves doctor, date, time and duration while patient is resolved", () => {
  const availability = updateAssistantConversationContext(blank(), { type: "check_availability", professionalClinicMemberId: doctor2, localDate: "2026-09-28", durationMinutes: 30 }, { state: "slots", professionalClinicMemberId: doctor2, date: "2026-09-28", durationMinutes: 30, slots: [{ start: "10:30" }] }, timeZone);
  const clicked = applyVerifiedAssistantChoiceToContext(availability, { kind: "available_slot", label: "10:30–11:00", professionalReference: doctor2, localDate: "2026-09-28", startTime: "10:30", endTime: "11:00", durationMinutes: 30 });
  const create = updateAssistantConversationContext(clicked, null, { state: "message", intent: { type: "create_appointment", professionalClinicMemberId: doctor2, localDate: "2026-09-28", localTime: "10:30", durationMinutes: 30 } }, timeZone);
  const followUp = contextualSchedulingFollowUp("para QA Patient N-D1-01", create, "2026-09-25");
  assert.equal(followUp?.type, "create_appointment");
  if (followUp?.type === "create_appointment") {
    assert.equal(followUp.patientQuery, "QA Patient N-D1-01");
    assert.equal(followUp.professionalClinicMemberId, doctor2);
    assert.equal(followUp.localDate, "2026-09-28");
    assert.equal(followUp.localTime, "10:30");
    assert.equal(followUp.durationMinutes, 30);
  }
  assert.deepEqual(clicked.selectedSlot, { professionalRef: doctor2, localDate: "2026-09-28", startTime: "10:30", durationMinutes: 30 });
});

test("E-F: focused appointment allows proposal intents; multiple results require a choice", () => {
  const focused = updateAssistantConversationContext(blank(), { type: "search_appointments", localDate: "2026-09-25" }, { state: "appointment", appointment: { id: appointment, startsAt: "2026-09-25T16:00:00Z" } }, timeZone);
  const reschedule = contextualAppointmentCommand("cámbiala a las 5", focused);
  assert.deepEqual(reschedule, { type: "reschedule_appointment", appointmentId: appointment, localDate: "2026-09-25", localTime: "17:00", durationMinutes: 30 });
  assert.deepEqual(contextualAppointmentCommand("cancélala", focused), { type: "cancel_appointment", appointmentId: appointment });
  assert.equal(contextualAppointmentCommand("cámbiala a las 5 y cuéntame un chiste", focused), null);
  const multiple = updateAssistantConversationContext(focused, { type: "search_appointments" }, { state: "appointments", appointments: [{ id: appointment, startsAt: "2026-09-25T16:00:00Z" }, { id: otherScope.actorId, startsAt: "2026-09-25T17:00:00Z" }] }, timeZone);
  assert.equal(multiple.focusedAppointmentRef, undefined);
  assert.deepEqual(ambiguousAppointmentRequest("cancela esa", multiple), { type: "cancel_appointment" });
  assert.equal(contextualAppointmentCommand("cancélala", multiple), null);
});

test("one displayed appointment is not focused unless the complete read proves uniqueness", () => {
  const result = { state: "appointments", appointments: [{ id: appointment, startsAt: "2026-09-25T16:00:00Z" }] };
  assert.equal(updateAssistantConversationContext(blank(), { type: "search_appointments" }, result, timeZone).focusedAppointmentRef, undefined);
  assert.equal(updateAssistantConversationContext(blank(), { type: "search_appointments" }, { ...result, uniqueVerified: true }, timeZone).focusedAppointmentRef, appointment);
});

test("G-H: replacing doctor or date invalidates a selected slot", () => {
  const prior = { ...blank(), activeIntent: "check_availability" as const, focusedProfessionalRef: doctor2, localDate: "2026-09-28", startTime: "10:30", durationMinutes: 30, selectedSlot: { professionalRef: doctor2, localDate: "2026-09-28", startTime: "10:30", durationMinutes: 30 } };
  const doctorChanged = updateAssistantConversationContext(prior, { type: "check_availability", professionalQuery: "QA Doctor 3 Norte", localDate: "2026-09-28", durationMinutes: 30 }, { state: "message" }, timeZone);
  assert.equal(doctorChanged.focusedProfessionalRef, undefined);
  assert.equal(doctorChanged.selectedSlot, undefined);
  const dateChanged = updateAssistantConversationContext(prior, { type: "check_availability", professionalClinicMemberId: doctor2, localDate: "2026-09-29", durationMinutes: 30 }, { state: "message" }, timeZone);
  assert.equal(dateChanged.focusedProfessionalRef, doctor2);
  assert.equal(dateChanged.selectedSlot, undefined);
  assert.equal(dateChanged.startTime, undefined);
});

test("I-O: tampered or stale patient, professional, appointment and slot refs are cleared", async () => {
  const original = { ...blank(), activeIntent: "create_appointment" as const, focusedPatientRef: patient, focusedProfessionalRef: doctor2, localDate: "2026-09-28", startTime: "10:30", selectedSlot: { professionalRef: doctor2, localDate: "2026-09-28", startTime: "10:30", durationMinutes: 30 }, durationMinutes: 30 };
  const patientTampered = await revalidateAssistantConversationContext({ ...original, focusedPatientRef: otherScope.actorId }, scope, validators(), now + 1000);
  assert.equal(patientTampered.reason, "invalidated"); assert.equal(patientTampered.context.focusedPatientRef, undefined);
  const professionalTampered = await revalidateAssistantConversationContext({ ...original, focusedProfessionalRef: otherScope.actorId }, scope, validators(), now + 1000);
  assert.equal(professionalTampered.context.focusedProfessionalRef, undefined); assert.equal(professionalTampered.context.selectedSlot, undefined);
  const appointmentTampered = await revalidateAssistantConversationContext({ ...original, focusedAppointmentRef: otherScope.actorId }, scope, validators(), now + 1000);
  assert.equal(appointmentTampered.context.focusedAppointmentRef, undefined);
  const inactive = await revalidateAssistantConversationContext(original, scope, validators({ professional: async () => null }), now + 1000);
  assert.equal(inactive.context.focusedProfessionalRef, undefined);
  const outOfScope = await revalidateAssistantConversationContext(original, scope, validators({ patient: async () => false }), now + 1000);
  assert.equal(outOfScope.context.focusedPatientRef, undefined);
  const occupied = await revalidateAssistantConversationContext(original, scope, validators({ slot: async () => false }), now + 1000);
  assert.equal(occupied.context.selectedSlot, undefined); assert.equal(occupied.context.startTime, undefined);
  const valid = await revalidateAssistantConversationContext(original, scope, validators(), now + 1000);
  assert.equal(valid.reason, "continued");
});

test("P-W: provider sees only the current message and structured slot names; out-of-domain stays local", async () => {
  const context = { ...blank(), activeIntent: "create_appointment" as const, focusedPatientRef: patient, focusedProfessionalRef: doctor2, localDate: "2026-09-28", durationMinutes: 30 };
  let calls = 0;
  let sent: PlannerContext | null = null;
  await planAssistantConversation({ message: "mañana", today: "2026-09-25", pending: intentFromAssistantContext(context), role: "owner", isProfessional: true, timeZone, enabled: true, readToolsEnabled: true, provider: async (payload) => { calls++; sent = payload; return { intent: "unknown", patientQuery: null, professionalQuery: null, appointmentQuery: null, date: null, time: null, duration: null, dateRange: null, status: null }; } });
  assert.equal(calls, 1);
  const serialized = JSON.stringify(sent);
  for (const forbidden of [patient, doctor2, scope.actorId, scope.clinicId, "previous user", "previous assistant", "tool output"]) assert.equal(serialized.includes(forbidden), false);
  assert.ok(serialized.includes("resolvedSlots"));
  let rejectedCalls = 0;
  await runGatedAssistantPlanner({ message: "Cuéntame un chiste", today: "2026-09-25", pending: intentFromAssistantContext(context), role: "owner", isProfessional: true, timeZone, readToolsEnabled: true, consumeRateLimit: () => true, provider: async () => { rejectedCalls++; return {}; } });
  assert.equal(rejectedCalls, 0);
  let contextualCalls = 0;
  await runGatedAssistantPlanner({ message: "a las cinco", today: "2026-09-25", pending: { type: "create_appointment", patientId: patient, professionalClinicMemberId: doctor2, localDate: "2026-09-28", localTime: "10:30", durationMinutes: 30 }, role: "owner", isProfessional: true, timeZone, readToolsEnabled: true, consumeRateLimit: () => true, provider: async () => { contextualCalls++; return { intent: "unknown", patientQuery: null, professionalQuery: null, appointmentQuery: null, date: null, time: null, duration: null, dateRange: null, status: null }; } });
  assert.equal(contextualCalls, 1);
  assert.ok(!Object.keys(context).some((key) => /message|response|transcript|output/i.test(key)));
});

test("planner keeps a verified patient filter when the next turn only changes the date", async () => {
  const prior = { ...blank(), activeIntent: "search_appointments" as const, focusedPatientRef: patient, localDate: "2026-09-25" };
  let calls = 0;
  const result = await planAssistantConversation({ message: "¿Y las del viernes?", today: "2026-09-25", pending: intentFromAssistantContext(prior), role: "owner", isProfessional: true, timeZone, enabled: true, readToolsEnabled: true, provider: async () => { calls++; return { intent: "search_appointments", patientQuery: null, professionalQuery: null, appointmentQuery: null, date: "2026-10-02", time: null, duration: null, dateRange: null, status: null }; } });
  assert.equal(calls, 1);
  assert.equal(result.state, "parsed");
  if (result.state === "parsed" && result.result.state === "intent" && result.result.intent.type === "search_appointments") {
    assert.equal(result.result.intent.patientId, patient);
    assert.equal(result.result.intent.localDate, "2026-10-02");
  } else assert.fail("Expected a patient-filtered appointment read");
});
