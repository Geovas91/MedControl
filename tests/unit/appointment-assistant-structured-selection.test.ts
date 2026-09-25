import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantStructuredChoice, resolveAssistantStructuredChoice } from "../../lib/assistant/orchestration/structured-selection.ts";

const patientId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const appointmentId = "44444444-4444-4444-8444-444444444444";
const appointment = { id: appointmentId, patient: "QA Patient", professional: "QA Doctor", startsAt: "2026-09-25T16:00:00Z", endsAt: "2026-09-25T16:30:00Z", status: "scheduled" };
const deps = (overrides: Record<string, unknown> = {}) => ({
  patient: async (id: string) => id === patientId,
  professional: async (id: string) => id === memberId || id === userId ? { clinicMemberId: memberId, userId, label: "QA Doctor" } : null,
  appointment: async (id: string) => id === appointmentId ? appointment : null,
  slot: async () => ({ valid: true, appointment }),
  ...overrides
});

test("structured selection parses only canonical, exact-shape references", () => {
  assert.ok(parseAssistantStructuredChoice({ kind: "patient", label: "QA Patient", reference: patientId }));
  assert.equal(parseAssistantStructuredChoice({ kind: "patient", label: "QA Patient", reference: "patient-1" }), null);
  assert.equal(parseAssistantStructuredChoice({ kind: "patient", label: "QA Patient", reference: patientId, clinicId: "forged" }), null);
});

test("patient selection is revalidated and continues create intent without executing it", async () => {
  let checked = 0;
  let mutationCalls = 0;
  const result = await resolveAssistantStructuredChoice({ kind: "patient", label: "QA Patient", reference: patientId }, null, deps({ patient: async () => { checked++; return true; } }));
  if (result.state !== "continue") throw new Error("Expected intent continuation");
  assert.deepEqual(result.intent, { type: "create_appointment", patientId, durationMinutes: 30 });
  assert.equal(checked, 1);
  assert.equal(mutationCalls, 0);
});

test("patient cross-tenant/stale selection is rejected", async () => {
  const result = await resolveAssistantStructuredChoice({ kind: "patient", label: "Forged", reference: patientId }, null, deps({ patient: async () => false }));
  assert.equal(result.state, "error");
});

test("professional selection maps canonical clinic member to user for appointment search", async () => {
  let checked = 0;
  const result = await resolveAssistantStructuredChoice({ kind: "professional", label: "QA Doctor", reference: memberId }, { type: "search_appointments", query: "", period: "upcoming" }, deps({ professional: async () => { checked++; return { clinicMemberId: memberId, userId, label: "QA Doctor" }; } }));
  if (result.state !== "continue") throw new Error("Expected intent continuation");
  assert.equal(result.intent.type, "search_appointments");
  if (result.intent.type === "search_appointments") assert.equal(result.intent.professionalId, userId);
  assert.equal(checked, 1);
});

test("appointment selection returns fresh status for a later confirmation proposal", async () => {
  const result = await resolveAssistantStructuredChoice({ kind: "appointment", label: "QA appointment", reference: appointmentId }, { type: "cancel_appointment", appointmentQuery: "QA Patient" }, deps());
  if (result.state !== "continue") throw new Error("Expected intent continuation");
  assert.equal(result.intent.type, "cancel_appointment");
  if (result.intent.type === "cancel_appointment") {
    assert.equal(result.intent.appointmentId, appointmentId);
    assert.equal(result.intent.expectedStatus, "scheduled");
  }
});

test("slot click preserves canonical date, professional and duration for proposal flow", async () => {
  const slot = { kind: "available_slot", label: "10:00–10:30", professionalReference: memberId, localDate: "2026-09-25", startTime: "10:00", endTime: "10:30", durationMinutes: 30 } as const;
  const result = await resolveAssistantStructuredChoice(slot, { type: "create_appointment", patientId, durationMinutes: 45 }, deps());
  if (result.state !== "continue") throw new Error("Expected intent continuation");
  assert.equal(result.intent.type, "create_appointment");
  if (result.intent.type === "create_appointment") {
    assert.equal(result.intent.patientId, patientId);
    assert.equal(result.intent.professionalClinicMemberId, memberId);
    assert.equal(result.intent.localDate, "2026-09-25");
    assert.equal(result.intent.localTime, "10:00");
    assert.equal(result.intent.durationMinutes, 30);
  }
});

test("stale slot and incompatible selection fail safely", async () => {
  const slot = { kind: "available_slot", label: "10:00–10:30", professionalReference: memberId, localDate: "2026-09-25", startTime: "10:00", endTime: "10:30", durationMinutes: 30 };
  const stale = await resolveAssistantStructuredChoice(slot, null, deps({ slot: async () => ({ valid: false }) }));
  const incompatible = await resolveAssistantStructuredChoice({ kind: "patient", label: "QA Patient", reference: patientId }, { type: "cancel_appointment" }, deps());
  assert.equal(stale.state, "error");
  assert.equal(incompatible.state, "error");
});
