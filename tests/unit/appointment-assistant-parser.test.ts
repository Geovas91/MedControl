import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantText, parseDateExpression, parseTimeExpression } from "../../lib/assistant/parser/deterministic.ts";

const today = "2026-09-14";

test("deterministic parser recognizes the Spanish appointment intents", () => {
  const create = parseAssistantText("Agenda una cita con Juan Pérez con la Dra. López el 15 de septiembre a las 10", today);
  assert.equal(create.state, "intent");
  if (create.state === "intent") {
    assert.equal(create.intent.type, "create_appointment");
    assert.equal(create.intent.patientQuery, "Juan Pérez");
    assert.equal(create.intent.professionalQuery, "López");
    assert.equal(create.intent.localDate, "2026-09-15");
    assert.equal(create.intent.localTime, "10:00");
  }
  assert.equal(parseAssistantText("¿Qué horarios tiene la Dra. López mañana?", today).state, "intent");
  assert.equal(parseAssistantText("Confirma la cita de Juan mañana", today).state, "intent");
  assert.equal(parseAssistantText("Cancela la cita de Juan", today).state, "intent");
  assert.equal(parseAssistantText("Reprograma la cita de Juan para las 11:30", today).state, "intent");
  assert.equal(parseAssistantText("¿Qué citas tengo mañana?", today).state, "intent");
  const todaySearch = parseAssistantText("Ver citas de hoy", today);
  assert.equal(todaySearch.state, "intent");
  if (todaySearch.state === "intent") {
    assert.equal(todaySearch.intent.type, "search_appointments");
    assert.equal(todaySearch.intent.localDate, today);
  }
  const availabilityPrompt = parseAssistantText("Ver disponibilidad", today);
  assert.equal(availabilityPrompt.state, "intent");
  if (availabilityPrompt.state === "intent") assert.equal(availabilityPrompt.intent.type, "check_availability");
});

test("professional matching is case, accent, whitespace and order insensitive", async () => {
  const { matchesAssistantQuery } = await import("../../lib/assistant/parser/deterministic.ts");
  assert.equal(matchesAssistantQuery("QA Doctor 1 Norte", " Doctor   1 QA Norte "), true);
  assert.equal(matchesAssistantQuery("QA Doctor 1 Norte", "Doctor 3 QA Norte"), false);
});

test("date and time normalization uses the supplied clinic date", () => {
  assert.equal(parseDateExpression("hoy", today), "2026-09-14");
  assert.equal(parseDateExpression("mañana", today), "2026-09-15");
  assert.equal(parseDateExpression("15/09/2026", today), "2026-09-15");
  assert.equal(parseDateExpression("15 de septiembre", today), "2026-09-15");
  assert.equal(parseDateExpression("2026-09-15", today), "2026-09-15");
  assert.equal(parseTimeExpression("a las 10"), "10:00");
  assert.equal(parseTimeExpression("10 am"), "10:00");
  assert.equal(parseTimeExpression("10:30 am"), "10:30");
  assert.equal(parseTimeExpression("15:00"), "15:00");
});

test("unsupported vague date/time remains a request for input", () => {
  const vagueDate = parseAssistantText("¿Qué horarios tiene la Dra. López el próximo jueves?", today);
  assert.equal(vagueDate.state, "needs_input");
  const vagueTime = parseAssistantText("Agenda una cita con Juan con la Dra. López mañana por la tarde", today);
  assert.equal(vagueTime.state, "needs_input");
  if (vagueTime.state === "needs_input") assert.equal(vagueTime.intent?.type, "create_appointment");
});

test("empty and unknown text are safe", () => {
  assert.equal(parseAssistantText("", today).state, "needs_input");
  assert.equal(parseAssistantText("Haz algo clínico", today).state, "unsupported");
});
