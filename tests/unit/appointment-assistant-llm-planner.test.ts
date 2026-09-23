import assert from "node:assert/strict";
import test from "node:test";
import { planAssistantConversation } from "../../lib/assistant/llm/planner.ts";
import { intentFromDraft, parseAssistantIntentDraft, type AssistantIntentDraft } from "../../lib/assistant/llm/contracts.ts";
import { resolveUniqueEntity } from "../../lib/assistant/orchestration/intents.ts";
import type { AssistantIntent } from "../../lib/assistant/orchestration/intents.ts";
import { PlannerProviderError } from "../../lib/assistant/llm/types.ts";

const today = "2026-09-23";
const base: AssistantIntentDraft = { intent: "unknown", patientQuery: null, professionalQuery: null, appointmentQuery: null, date: null, time: null, duration: null };
const options = { today, pending: null, role: "owner", isProfessional: true, timeZone: "America/Mexico_City", enabled: true };
const planned = async (message: string, draft: unknown, pending: AssistantIntent | null = null) => {
  let calls = 0;
  const result = await planAssistantConversation({ ...options, message, pending, provider: async () => { calls++; return draft; } });
  return { result, calls };
};
const intentOf = (result: Awaited<ReturnType<typeof planned>>["result"]) => result.state === "parsed" && result.result.state === "intent" ? result.result.intent : null;

test("A: natural create request produces only a typed intent", async () => {
  const { result, calls } = await planned("agenda una cita mañana a las 4", { ...base, intent: "create_appointment", date: "mañana", time: "16:00" });
  assert.equal(calls, 1);
  assert.deepEqual(intentOf(result), { type: "create_appointment", patientQuery: undefined, patientId: undefined, professionalQuery: undefined, professionalClinicMemberId: undefined, localDate: "2026-09-24", localTime: "16:00", durationMinutes: 30 });
});

test("B: appointments today is a read intent", async () => {
  const { result } = await planned("dame mis citas de hoy", { ...base, intent: "search_appointments", date: "hoy" });
  assert.deepEqual(intentOf(result), { type: "search_appointments", query: undefined, localDate: today });
});

test("C: cancel produces an intent, never a mutation", async () => {
  const { result } = await planned("quiero cancelar mi cita de mañana", { ...base, intent: "cancel_appointment", appointmentQuery: "mi cita de mañana" });
  assert.deepEqual(intentOf(result), { type: "cancel_appointment", appointmentQuery: "mi cita de mañana", appointmentId: undefined });
});

test("D: provider error falls back to the deterministic parser", async () => {
  let calls = 0;
  const result = await planAssistantConversation({ ...options, message: "Ver citas de hoy", provider: async () => { calls++; throw new Error("secret provider failure"); } });
  assert.equal(calls, 1);
  assert.equal(intentOf(result)?.type, "search_appointments");
});

test("E: malformed output falls back", async () => {
  const { result } = await planned("Ver citas de hoy", { intent: "cancel_appointment" });
  assert.equal(intentOf(result)?.type, "search_appointments");
});

test("F: canonical IDs or extra fields invalidate model output", () => {
  assert.equal(parseAssistantIntentDraft({ ...base, intent: "create_appointment", patientId: "id" }), null);
  assert.equal(parseAssistantIntentDraft({ ...base, appointmentQuery: "550e8400-e29b-41d4-a716-446655440000" }), null);
});

test("G: ambiguous patient query remains a query for protected resolution", async () => {
  const { result } = await planned("agenda a Juan mañana", { ...base, intent: "create_appointment", patientQuery: "Juan", date: "mañana" });
  const intent = intentOf(result);
  assert.equal(intent?.type, "create_appointment");
  if (intent?.type === "create_appointment") { assert.equal(intent.patientId, undefined); assert.equal(intent.patientQuery, "Juan"); }
  assert.equal(resolveUniqueEntity([{ id: "a" }, { id: "b" }]).state, "AMBIGUOUS");
});

test("H: ambiguous professional stays unresolved", async () => {
  const { result } = await planned("agenda con García mañana", { ...base, intent: "create_appointment", professionalQuery: "García", date: "mañana" });
  const intent = intentOf(result);
  assert.equal(intent?.type, "create_appointment");
  if (intent?.type === "create_appointment") { assert.equal(intent.professionalClinicMemberId, undefined); assert.equal(intent.professionalQuery, "García"); }
  assert.equal(resolveUniqueEntity([{ id: "a" }, { id: "b" }]).state, "AMBIGUOUS");
});

test("I: feature off makes zero provider calls", async () => {
  let calls = 0;
  const result = await planAssistantConversation({ ...options, enabled: false, message: "Ver citas de hoy", provider: async () => { calls++; return base; } });
  assert.equal(calls, 0);
  assert.equal(intentOf(result)?.type, "search_appointments");
});

test("J: one user turn makes at most one provider call", async () => {
  const { calls } = await planned("agenda una cita mañana", { ...base, intent: "create_appointment", date: "mañana" });
  assert.equal(calls, 1);
});

test("selected canonical ID survives only from pending state, not from model", () => {
  const pending: AssistantIntent = { type: "create_appointment", patientId: "selected-patient", durationMinutes: 30 };
  const parsed = parseAssistantIntentDraft({ ...base, intent: "create_appointment", professionalQuery: "García" });
  assert.ok(parsed);
  const intent = intentFromDraft(parsed, today, pending);
  assert.equal(intent?.type, "create_appointment");
  if (intent?.type === "create_appointment") assert.equal(intent.patientId, "selected-patient");
});

test("follow-up carries a prior selected ID but never sends it to the provider", async () => {
  const pending: AssistantIntent = { type: "create_appointment", patientId: "selected-patient", durationMinutes: 30 };
  let sent = "";
  const result = await planAssistantConversation({ ...options, pending, message: "mañana a las 4", provider: async (context) => { sent = JSON.stringify(context); return { ...base, intent: "create_appointment", date: "mañana", time: "16:00" }; } });
  const intent = intentOf(result);
  assert.equal(intent?.type, "create_appointment");
  if (intent?.type === "create_appointment") assert.equal(intent.patientId, "selected-patient");
  assert.equal(sent.includes("selected-patient"), false);
});

test("explicit new intent keeps deterministic precedence over a stale model draft", async () => {
  const pending: AssistantIntent = { type: "create_appointment", durationMinutes: 30 };
  const { result } = await planned("Ver citas de hoy", { ...base, intent: "create_appointment" }, pending);
  assert.equal(intentOf(result)?.type, "search_appointments");
});

test("ungrounded patient names fall back instead of resolving an invented patient", async () => {
  const { result } = await planned("agenda una cita mañana", { ...base, intent: "create_appointment", patientQuery: "Persona inventada" });
  const intent = intentOf(result);
  assert.equal(intent?.type, "create_appointment");
  if (intent?.type === "create_appointment") assert.equal(intent.patientQuery, undefined);
});

test("timeout and HTTP provider failures use deterministic fallback without retries", async () => {
  for (const code of ["timeout", "http_error"] as const) {
    let calls = 0;
    const result = await planAssistantConversation({ ...options, message: "Ver citas de hoy", provider: async () => { calls++; throw new PlannerProviderError(code, code === "http_error" ? 503 : undefined); } });
    assert.equal(intentOf(result)?.type, "search_appointments");
    assert.equal(calls, 1);
  }
});

test("planner payload omits email and phone from the current message", async () => {
  let sent = "";
  await planAssistantConversation({ ...options, message: "Agenda QA Patient N-D1-01, correo qa@example.test, teléfono +52 55 1234 5678 mañana", provider: async (context) => { sent = JSON.stringify(context); return base; } });
  assert.equal(sent.includes("qa@example.test"), false);
  assert.equal(sent.includes("+52 55 1234 5678"), false);
  assert.match(sent, /QA Patient N-D1-01/);
});
