import assert from "node:assert/strict";
import test from "node:test";
import { isConversationResetCommand, resolveConversationInput } from "../../lib/assistant/orchestration/conversation.ts";
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
