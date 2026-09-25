import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantIntentDraft } from "../../lib/assistant/llm/contracts.ts";
import { planAssistantConversation } from "../../lib/assistant/llm/planner.ts";
import { requestOpenAiPlanner } from "../../lib/assistant/llm/transport.ts";
import { isAssistantReadIntent, isValidAssistantReadIntent, orchestrateAssistantReadIntent, shouldOrchestrateAssistantReads } from "../../lib/assistant/orchestration/read-tools.ts";

const today = "2026-09-23";
const base = { patientQuery: null, professionalQuery: null, appointmentQuery: null, date: null, time: null, duration: null, dateRange: null, status: null };
const draft = (intent: string, extra: Record<string, unknown> = {}) => ({ intent, ...base, ...extra });
const patient = (name: string, id = `patient-${name}`) => ({ patient_id: id, display_name: name, status: "active", clinical_notes: "PRIVATE" });
const professional = (name: string, id = `member-${name}`) => ({ professional_clinic_member_id: id, professional_user_id: `user-${id}`, display_name: name, token: "PRIVATE" });
const appointment = (id: string, patientId = "patient-1") => ({ appointment_id: id, patient_id: patientId, patient_display_name: "QA Patient", professional_id: "user-member-1", professional_display_name: "QA Doctor", starts_at: "2026-09-24T16:00:00Z", ends_at: "2026-09-24T16:30:00Z", status: "scheduled", diagnosis: "PRIVATE" });

async function plan(message: string, output: unknown, readToolsEnabled = true) {
  let providerCalls = 0;
  const providerContexts: unknown[] = [];
  const planned = await planAssistantConversation({
    message, today, pending: null, role: "owner", isProfessional: false, timeZone: "America/Mexico_City", enabled: true, readToolsEnabled,
    provider: async (context) => { providerCalls++; providerContexts.push(context); return output; }
  });
  if (planned.state !== "parsed" || planned.result.state !== "intent") throw new Error("Expected a typed intent");
  return { intent: planned.result.intent, providerCalls, getProviderCalls: () => providerCalls, providerContexts };
}

function toolWith(responses: Record<string, unknown>) {
  const calls: Array<{ name: string; input: unknown }> = [];
  return {
    calls,
    readTool: async (name: string, input: unknown) => {
      calls.push({ name, input });
      const response = responses[name];
      return response && typeof response === "object" && "ok" in response ? response as { ok: false; error: { code: string; safeMessage: string } } : { ok: true as const, data: response ?? [] };
    }
  };
}

test("flags keep deterministic and B5.4.1 modes separate from read orchestration", () => {
  assert.equal(shouldOrchestrateAssistantReads(false, true), false);
  assert.equal(shouldOrchestrateAssistantReads(true, false), false);
  assert.equal(shouldOrchestrateAssistantReads(true, true), true);
  assert.equal(parseAssistantIntentDraft(draft("get_professionals"), false), null);
  assert.ok(parseAssistantIntentDraft(draft("get_professionals"), true));
  assert.ok(parseAssistantIntentDraft(draft("search_appointments", { status: "confirmed" }), true));
  assert.equal(parseAssistantIntentDraft(draft("search_appointments", { status: "private_status" }), true), null);
  assert.equal(parseAssistantIntentDraft(draft("get_appointment", { dateRange: "upcoming" }), true), null);
  assert.equal(isValidAssistantReadIntent({ type: "get_appointment", localDate: "2026-09-24" }), true);
  assert.equal(isValidAssistantReadIntent({ type: "get_appointment", localDate: "not-a-date" }), false);
});

test("transport uses a read-only schema and never asks the provider to execute tools", async () => {
  const requests: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(draft("get_professionals")) }] }], model: "gpt-6-luna", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }), { status: 200 });
  };
  await requestOpenAiPlanner({ context: { message: "Muéstrame los doctores", today, activeIntent: null, resolvedSlots: [], missingSlots: [], role: "owner", isProfessional: false, timeZone: "America/Mexico_City" }, apiKey: "synthetic-test-key", model: "gpt-6-luna", readToolsEnabled: true, fetcher });
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: "none" });
  assert.equal(request.max_output_tokens, 240);
  assert.equal("tools" in request, false);
  assert.equal("previous_response_id" in request, false);
  const format = (request.text as { format: { schema: { properties: { intent: { enum: string[] } } } } }).format;
  assert.equal(format.schema.properties.intent.enum.includes("get_professionals"), true);
});

test("A: tomorrow appointments execute the protected search once", async () => {
  const { intent, providerCalls } = await plan("¿Qué citas tengo mañana?", draft("search_appointments", { date: "mañana" }));
  assert.equal(providerCalls, 1);
  assert.equal(isAssistantReadIntent(intent), true);
  if (!isAssistantReadIntent(intent)) return;
  const tool = toolWith({ search_appointments: [appointment("appointment-1")] });
  const response = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today });
  assert.equal(response.state, "appointments");
  assert.deepEqual(tool.calls, [{ name: "search_appointments", input: { date: "2026-09-24" } }]);
});

test("B: today uses the clinic local date passed by the server", async () => {
  const { intent } = await plan("Muéstrame mis citas de hoy", draft("search_appointments", { date: "hoy" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ search_appointments: [] });
  await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today });
  assert.deepEqual(tool.calls[0], { name: "search_appointments", input: { date: today } });
});

test("C: Friday availability resolves a protected professional and uses the slot tool", async () => {
  const { intent } = await plan("Qué horarios tiene QA Doctor 2 Norte el viernes", draft("check_availability", { professionalQuery: "QA Doctor 2 Norte", date: "viernes" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ get_professionals: [professional("QA Doctor 2 Norte", "member-2")], get_available_slots: [{ local_start: "11:00", local_end: "11:30", provider_payload: "PRIVATE" }] });
  const response = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today });
  assert.equal(response.state, "slots");
  assert.deepEqual(tool.calls.map((call) => call.name), ["get_professionals", "get_available_slots"]);
  assert.deepEqual(tool.calls[1].input, { professionalClinicMemberId: "member-2", date: "2026-09-25", durationMinutes: 30 });
  assert.equal(JSON.stringify(response).includes("PRIVATE"), false);
});

test("D: upcoming patient appointments resolve a canonical patient server-side", async () => {
  const { intent } = await plan("Busca las próximas citas de QA Patient N-D1-01", draft("search_appointments", { patientQuery: "QA Patient N-D1-01", dateRange: "upcoming" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ search_patients: [patient("QA Patient N-D1-01", "patient-1")], search_appointments: [appointment("appointment-1")] });
  const response = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today });
  assert.equal(response.state, "appointments");
  assert.deepEqual(tool.calls[1], { name: "search_appointments", input: { patientId: "patient-1", date: today, period: "upcoming" } });
});

test("E/F: ambiguous patient or professional never triggers the final read", async () => {
  const patientIntent = await plan("Muéstrame las citas de Juan mañana", draft("search_appointments", { patientQuery: "Juan", date: "mañana" }));
  const patients = toolWith({ search_patients: [patient("Juan Uno"), patient("Juan Dos")], search_appointments: [] });
  if (!isAssistantReadIntent(patientIntent.intent)) throw new Error("Expected a read intent");
  const patientResponse = await orchestrateAssistantReadIntent(patientIntent.intent, { readTool: patients.readTool, today });
  assert.equal(patientResponse.state, "choices");
  assert.deepEqual(patients.calls.map((call) => call.name), ["search_patients"]);

  const professionalIntent = await plan("Qué horarios tiene Doctor 2 el viernes", draft("check_availability", { professionalQuery: "Doctor 2", date: "viernes" }));
  const doctors = toolWith({ get_professionals: [professional("Doctor 2 Norte"), professional("Doctor 2 Sur")], get_available_slots: [] });
  if (!isAssistantReadIntent(professionalIntent.intent)) throw new Error("Expected a read intent");
  const doctorResponse = await orchestrateAssistantReadIntent(professionalIntent.intent, { readTool: doctors.readTool, today });
  assert.equal(doctorResponse.state, "choices");
  assert.deepEqual(doctors.calls.map((call) => call.name), ["get_professionals"]);
});

test("G/H: out-of-tenant candidates remain unresolved by protected lookups", async () => {
  const patientIntent = await plan("Busca las citas de QA Patient Exterior", draft("search_appointments", { patientQuery: "QA Patient Exterior" }));
  const patients = toolWith({ search_patients: [], search_appointments: [] });
  if (!isAssistantReadIntent(patientIntent.intent)) throw new Error("Expected a read intent");
  assert.equal((await orchestrateAssistantReadIntent(patientIntent.intent, { readTool: patients.readTool, today })).state, "message");
  assert.deepEqual(patients.calls.map((call) => call.name), ["search_patients"]);

  const doctorIntent = await plan("Qué horarios tiene Doctor Exterior mañana", draft("check_availability", { professionalQuery: "Doctor Exterior", date: "mañana" }));
  const doctors = toolWith({ get_professionals: [], get_available_slots: [] });
  if (!isAssistantReadIntent(doctorIntent.intent)) throw new Error("Expected a read intent");
  assert.equal((await orchestrateAssistantReadIntent(doctorIntent.intent, { readTool: doctors.readTool, today })).state, "message");
  assert.deepEqual(doctors.calls.map((call) => call.name), ["get_professionals"]);
});

test("I: tool failures discard raw error content in both UI and logs", async () => {
  const { intent } = await plan("Muéstrame mis citas de hoy", draft("search_appointments", { date: "hoy" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ search_appointments: { ok: false, error: { code: "raw-secret-code", safeMessage: "PRIVATE DB error" } } });
  const events: unknown[] = [];
  const response = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today, observe: (event, data) => events.push({ event, data }) });
  assert.equal(response.state, "error");
  assert.equal(JSON.stringify({ response, events }).includes("PRIVATE"), false);
  assert.equal(JSON.stringify({ response, events }).includes("raw-secret-code"), false);
  assert.equal(JSON.stringify(events).includes("unknown"), true);
});

test("J: lists are bounded and copy scheduling fields only", async () => {
  const { intent } = await plan("Qué citas tengo mañana", draft("search_appointments", { date: "mañana" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ search_appointments: Array.from({ length: 12 }, (_, index) => appointment(`appointment-${index}`)) });
  const response = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today });
  assert.equal(response.state, "appointments");
  if (response.state !== "appointments") return;
  assert.equal(response.appointments.length, 10);
  assert.equal(response.hasMore, true);
  assert.equal(JSON.stringify(response).includes("PRIVATE"), false);
});

test("detail and professional listing use only read tools and safe projections", async () => {
  const detail = await plan("Quiero ver la cita de mañana con QA Doctor 1 Norte", draft("get_appointment", { professionalQuery: "QA Doctor 1 Norte", date: "mañana" }));
  if (!isAssistantReadIntent(detail.intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ get_professionals: [professional("QA Doctor 1 Norte", "member-1")], search_appointments: [appointment("appointment-1")], get_appointment: appointment("appointment-1") });
  const detailResponse = await orchestrateAssistantReadIntent(detail.intent, { readTool: tool.readTool, today });
  assert.equal(detailResponse.state, "appointment");
  assert.deepEqual(tool.calls.map((call) => call.name), ["get_professionals", "search_appointments", "get_appointment"]);
  assert.equal(JSON.stringify(detailResponse).includes("PRIVATE"), false);

  const list = await plan("Muéstrame los doctores disponibles", draft("get_professionals"));
  if (!isAssistantReadIntent(list.intent)) throw new Error("Expected a read intent");
  const listed = await orchestrateAssistantReadIntent(list.intent, { readTool: tool.readTool, today });
  assert.equal(listed.state, "professionals");
  assert.equal(JSON.stringify(listed).includes("PRIVATE"), false);
});

test("ambiguous detail asks for a choice in clinic-local time", async () => {
  const { intent } = await plan("Quiero ver la cita de mañana con QA Doctor 1 Norte", draft("get_appointment", { professionalQuery: "QA Doctor 1 Norte", date: "mañana" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ get_professionals: [professional("QA Doctor 1 Norte", "member-1")], search_appointments: [appointment("appointment-1"), appointment("appointment-2")], get_appointment: appointment("appointment-1") });
  const response = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today, timeZone: "America/Mexico_City" });
  assert.equal(response.state, "choices");
  if (response.state !== "choices") return;
  assert.equal(response.choices.length, 2);
  assert.equal(response.choices[0].label.includes("10:00"), true);
  assert.deepEqual(tool.calls.map((call) => call.name), ["get_professionals", "search_appointments"]);
});

test("a capped lookup cannot be treated as a unique professional or appointment", async () => {
  const availability = await plan("Qué horarios tiene QA Doctor el viernes", draft("check_availability", { professionalQuery: "QA Doctor", date: "viernes" }));
  if (!isAssistantReadIntent(availability.intent)) throw new Error("Expected a read intent");
  const professionals = toolWith({ get_professionals: [professional("QA Doctor", "member-1"), ...Array.from({ length: 24 }, (_, index) => professional(`Other ${index}`))], get_available_slots: [] });
  const available = await orchestrateAssistantReadIntent(availability.intent, { readTool: professionals.readTool, today });
  assert.equal(available.state, "message");
  assert.deepEqual(professionals.calls.map((call) => call.name), ["get_professionals"]);

  const detail = await plan("Quiero ver la cita de mañana de QA Patient", draft("get_appointment", { appointmentQuery: "QA Patient", date: "mañana" }));
  if (!isAssistantReadIntent(detail.intent)) throw new Error("Expected a read intent");
  const appointments = toolWith({ search_appointments: [appointment("appointment-1"), ...Array.from({ length: 24 }, (_, index) => ({ ...appointment(`appointment-${index + 2}`), patient_display_name: `Other ${index}` }))], get_appointment: appointment("appointment-1") });
  const found = await orchestrateAssistantReadIntent(detail.intent, { readTool: appointments.readTool, today });
  assert.equal(found.state, "message");
  assert.deepEqual(appointments.calls.map((call) => call.name), ["search_appointments"]);
});

test("mutation intents cannot enter the read dispatcher or execute a mutation tool", async () => {
  for (const [message, output] of [
    ["Agenda una cita mañana", draft("create_appointment", { date: "mañana" })],
    ["Cancela mi cita de mañana", draft("cancel_appointment", { appointmentQuery: "mi cita de mañana" })],
    ["Reprograma mi cita mañana", draft("reschedule_appointment", { appointmentQuery: "mi cita", date: "mañana" })]
  ] as const) {
    const { intent, providerCalls } = await plan(message, output);
    const tool = toolWith({});
    assert.equal(providerCalls, 1);
    assert.equal(isAssistantReadIntent(intent), false);
    assert.equal(tool.calls.length, 0);
  }
});

test("privacy: read output is never sent to a second provider call", async () => {
  const { intent, getProviderCalls, providerContexts } = await plan("¿Qué citas tengo mañana?", draft("search_appointments", { date: "mañana" }));
  if (!isAssistantReadIntent(intent)) throw new Error("Expected a read intent");
  const tool = toolWith({ search_appointments: [appointment("appointment-1")] });
  const rendered = await orchestrateAssistantReadIntent(intent, { readTool: tool.readTool, today });
  assert.equal(rendered.state, "appointments");
  assert.equal(getProviderCalls(), 1);
  assert.equal(JSON.stringify(providerContexts).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(rendered).includes("PRIVATE"), false);
  assert.equal(parseAssistantIntentDraft({ ...draft("search_appointments"), patientId: "10000000-0000-4000-8000-000000000001" }, true), null);
  assert.equal(parseAssistantIntentDraft(draft("search_appointments", { patientQuery: "10000000-0000-4000-8000-000000000001" }), true), null);
});
