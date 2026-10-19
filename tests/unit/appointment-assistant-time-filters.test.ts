import assert from "node:assert/strict";
import test from "node:test";
import { isAssistantIntent, parseAssistantText } from "../../lib/assistant/parser/deterministic.ts";
import { assistantTimeMatches, isValidAssistantTimeFilter, parseAssistantTimeFilter } from "../../lib/assistant/orchestration/time-filter.ts";
import { intentFromAssistantContext, newAssistantConversationContext, readAssistantConversationContext, updateAssistantConversationContext } from "../../lib/assistant/orchestration/context.ts";
import { orchestrateAssistantReadIntent } from "../../lib/assistant/orchestration/read-tools.ts";
import { resolveConversationInput } from "../../lib/assistant/orchestration/conversation.ts";
import { combineClinicDateTime } from "../../lib/appointments/create.ts";
import { toolSchemas } from "../../lib/assistant/tools/contracts.ts";

const scope = { actorId: "11111111-1111-4111-8111-111111111111", clinicId: "22222222-2222-4222-8222-222222222222" };
const professional = "33333333-3333-4333-8333-333333333333";
const today = "2026-10-19";
const zone = "America/Mexico_City";
const filter = (text: string) => {
  const result = parseAssistantTimeFilter(text);
  assert.equal(result.state, "filter", text);
  if (result.state !== "filter") throw new Error("Expected filter");
  return result.filter;
};

test("Spanish time phrases have explicit inclusive and exclusive limits", () => {
  assert.deepEqual(filter("Después de las 15"), { minimum: { time: "15:00", inclusive: false } });
  assert.deepEqual(filter("Antes de mediodía"), { maximum: { time: "12:00", inclusive: false } });
  assert.deepEqual(filter("A partir de las 14"), { minimum: { time: "14:00", inclusive: true } });
  assert.deepEqual(filter("Por la mañana"), { minimum: { time: "00:00", inclusive: true }, maximum: { time: "12:00", inclusive: false } });
  assert.deepEqual(filter("Por la tarde"), { minimum: { time: "12:00", inclusive: true }, maximum: { time: "18:00", inclusive: false } });
  assert.deepEqual(filter("Después de las 3 de la tarde"), { minimum: { time: "15:00", inclusive: false } });
  assert.equal(parseAssistantTimeFilter("¿Y después de las 3?").state, "ambiguous");
  assert.equal(assistantTimeMatches("15:00", filter("Después de las 15")), false);
  assert.equal(assistantTimeMatches("15:00", filter("A partir de las 15")), true);
  assert.equal(isValidAssistantTimeFilter({ minimum: { time: "25:00", inclusive: true } }), false);
  assert.equal(isValidAssistantTimeFilter({ minimum: { time: "16:00", inclusive: true }, maximum: { time: "12:00", inclusive: false } }), false);
});

test("deterministic read parser preserves time filters without creating proposals", () => {
  const agenda = parseAssistantText("Muéstrame las citas de mañana después de las 15", today);
  assert.equal(agenda.state, "intent");
  if (agenda.state === "intent") {
    assert.equal(isAssistantIntent(agenda.intent), true);
    assert.equal(agenda.intent.type, "search_appointments");
    if (agenda.intent.type === "search_appointments") assert.deepEqual(agenda.intent.timeFilter, filter("después de las 15"));
  }
  const availability = parseAssistantText("¿Qué horarios tiene mañana el doctor García después del mediodía?", today);
  assert.equal(availability.state, "intent");
  if (availability.state === "intent") assert.equal(availability.intent.type, "check_availability");
  const unfiltered = parseAssistantText("¿Qué citas tengo mañana?", today);
  if (unfiltered.state === "intent") assert.equal(isAssistantIntent(unfiltered.intent), true);
  const dateNeeded = parseAssistantText("¿Qué horarios tiene el doctor García después del mediodía?", today);
  assert.equal(dateNeeded.state, "needs_input");
  if (dateNeeded.state === "needs_input" && dateNeeded.intent?.type === "check_availability") assert.equal(dateNeeded.intent.professionalQuery, "García");
  assert.equal(parseAssistantText("Agenda una cita después de las 15", today).state, "needs_input");
  const withoutDate = parseAssistantText("Muéstrame las citas después de las 15", today);
  assert.equal(withoutDate.state, "needs_input");
  if (withoutDate.state === "needs_input" && withoutDate.intent?.type === "search_appointments") {
    const continued = resolveConversationInput(withoutDate.intent, "mañana", today);
    assert.equal(continued.state, "parsed");
    if (continued.state === "parsed" && continued.result.state === "intent" && continued.result.intent.type === "search_appointments") {
      assert.equal(continued.result.intent.localDate, "2026-10-20");
      assert.deepEqual(continued.result.intent.timeFilter, filter("después de las 15"));
    }
  }
});

test("context keeps date and verified entities, replaces the prior filter, and expires", () => {
  const now = 1_792_400_000_000;
  const first = updateAssistantConversationContext(newAssistantConversationContext(scope, now), { type: "search_appointments", localDate: "2026-10-20", patientId: professional, timeFilter: filter("después de las 15") }, { state: "appointments", appointments: [] }, zone);
  const pending = intentFromAssistantContext(first);
  assert.equal(pending?.type, "search_appointments");
  if (pending?.type !== "search_appointments") throw new Error("Expected search");
  assert.equal(pending.localDate, "2026-10-20");
  const second = updateAssistantConversationContext(first, { ...pending, timeFilter: filter("antes de las 12") }, { state: "appointments", appointments: [] }, zone);
  assert.deepEqual(second.timeFilter, filter("antes de las 12"));
  assert.equal(second.focusedPatientRef, professional);
  assert.equal(readAssistantConversationContext(second, scope, now + 901_000).context.timeFilter, undefined);
  assert.equal(readAssistantConversationContext(second, { ...scope, clinicId: professional }, now).context.timeFilter, undefined);
  const changed = updateAssistantConversationContext(second, { type: "check_availability", professionalClinicMemberId: professional, localDate: "2026-10-20", durationMinutes: 30 }, { state: "message" }, zone);
  assert.equal(changed.timeFilter, undefined);
});

test("availability rereads authorized slots and filters them before presentation", async () => {
  const calls: string[] = [];
  const result = await orchestrateAssistantReadIntent({ type: "check_availability", professionalClinicMemberId: professional, localDate: "2026-10-20", durationMinutes: 30, timeFilter: filter("después del mediodía") }, {
    today, timeZone: zone,
    readTool: async (name) => {
      calls.push(name);
      if (name === "get_professionals") return { ok: true, data: [{ professional_clinic_member_id: professional, professional_user_id: scope.actorId, display_name: "García" }] };
      if (name === "get_available_slots") return { ok: true, data: [{ local_start: "12:00", local_end: "12:30" }, { local_start: "12:30", local_end: "13:00" }] };
      throw new Error("Unexpected tool");
    }
  });
  assert.deepEqual(calls, ["get_professionals", "get_available_slots"]);
  assert.equal(result.state, "slots");
  if (result.state === "slots") assert.deepEqual(result.slots.map((slot) => slot.start), ["12:30"]);
});

test("filtered appointment reads respect pre-pagination hasMore metadata", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const timeFilter = filter("después de las 15");
  const result = await orchestrateAssistantReadIntent({ type: "search_appointments", localDate: "2026-10-20", timeFilter }, {
    today, timeZone: zone,
    readTool: async (name, input) => {
      calls.push({ name, input });
      return { ok: true, data: { appointments: [], hasMore: true } };
    }
  });
  assert.deepEqual(calls, [{ name: "search_appointments", input: { date: "2026-10-20", timeFilter } }]);
  assert.equal(result.state, "appointments");
  if (result.state === "appointments") {
    assert.equal(result.hasMore, true);
    assert.equal(result.uniqueVerified, false);
  }
});

test("appointment filter input is strict and clinic wall time conversion handles daylight saving", () => {
  assert.equal(toolSchemas.searchAppointments.parse({ date: "2026-10-20", timeFilter: { minimum: { time: "25:00", inclusive: true } } }), null);
  assert.equal(toolSchemas.searchAppointments.parse({ date: "2026-10-20", period: "upcoming", timeFilter: filter("después de las 15") }), null);
  assert.equal(combineClinicDateTime("2026-11-01", "01:30", "America/New_York").state, "ambiguous");
  assert.equal(combineClinicDateTime("2026-03-08", "02:30", "America/New_York").state, "nonexistent");
  const local = combineClinicDateTime("2026-10-20", "15:00", zone);
  assert.equal(local.state, "valid");
});
