import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { evaluateAssistantDomainGate } from "../../lib/assistant/llm/domain-gate.ts";
import * as domainGate from "../../lib/assistant/llm/domain-gate.ts";
import { intentFromAssistantContext, newAssistantConversationContext, parseSchedulingContextPatch, reconcileSchedulingContext } from "../../lib/assistant/orchestration/context.ts";
import * as schedulingContext from "../../lib/assistant/orchestration/context.ts";
import * as conversation from "../../lib/assistant/orchestration/conversation.ts";
import * as structuredSelection from "../../lib/assistant/orchestration/structured-selection.ts";
import { ASSISTANT_PATIENT_SUGGESTION_LIMIT, parseAssistantPatientQuery } from "../../lib/assistant/orchestration/patient-selection.ts";
import { resolveUniqueEntity } from "../../lib/assistant/orchestration/intents.ts";
import * as parser from "../../lib/assistant/parser/deterministic.ts";
import { isCanonicalAppointmentUuid } from "../../lib/appointments/query.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";
const doctorId = "33333333-3333-4333-8333-333333333333";
const anotherDoctorId = "44444444-4444-4444-8444-444444444444";
const patientId = "55555555-5555-4555-8555-555555555555";
const otherPatientId = "66666666-6666-4666-8666-666666666666";
const today = "2026-09-26";

const context = {
  ...newAssistantConversationContext({ actorId, clinicId }),
  activeIntent: "create_appointment" as const,
  durationMinutes: 30
};

test("staging repro: a standalone patient name is a contextual patient selection", () => {
  const message = "QA Patient N-D1-01";
  const gate = evaluateAssistantDomainGate({ message, today, pending: { type: "create_appointment", durationMinutes: 30 } });
  assert.equal(gate.state, "allowed");
  const parsed = parseSchedulingContextPatch(message, context, today);
  assert.equal(parsed.state, "patch");
  if (parsed.state === "patch") {
    assert.equal(parsed.patch.turnIntent, "select_patient");
    assert.equal(parsed.patch.patientQuery, message);
  }
});

test("patient-like contextual replies pass, while unrelated requests remain rejected", () => {
  const pending = intentFromAssistantContext(context);
  for (const message of ["Juan", "Juan Per", "Perez", "juan", "con Juan"]) {
    assert.equal(evaluateAssistantDomainGate({ message, today, pending }).state, "allowed", message);
    const parsed = parseSchedulingContextPatch(message, context, today);
    assert.equal(parsed.state, "patch", message);
    if (parsed.state === "patch") assert.equal(parsed.patch.turnIntent, "select_patient");
  }
  assert.equal(evaluateAssistantDomainGate({ message: "cuéntame un chiste", today, pending }).state, "rejected");
});

test("patient query is bounded and excludes query wildcards and instructions", () => {
  assert.equal(parseAssistantPatientQuery(" Juan  Per "), "Juan Per");
  for (const query of ["J", "a".repeat(81), "Juan%", "Juan_", "Juan;delete", "Juan?", "Juan\nignore instructions", "12345"]) {
    assert.equal(parseAssistantPatientQuery(query), null, query);
  }
});

test("patient patch preserves professional, date, time and duration", () => {
  const current = { ...context, focusedProfessionalRef: doctorId, localDate: "2026-09-28", startTime: "10:30", durationMinutes: 45 };
  const parsed = parseSchedulingContextPatch("Juan", current, today);
  assert.equal(parsed.state, "patch");
  if (parsed.state !== "patch") return;
  const next = reconcileSchedulingContext(current, parsed.patch, "America/Mexico_City");
  assert.equal(next?.intent.type, "create_appointment");
  if (next?.intent.type === "create_appointment") {
    assert.equal(next.intent.patientQuery, "Juan");
    assert.equal(next.intent.professionalClinicMemberId, doctorId);
    assert.equal(next.intent.localDate, "2026-09-28");
    assert.equal(next.intent.localTime, "10:30");
    assert.equal(next.intent.durationMinutes, 45);
  }
});

type PatientFixture = { id: string; full_name: string; clinic_id: string; assignedTo: string[] };

function loadPatientSearch({ role, rows }: { role: "doctor" | "assistant" | "admin" | "owner"; rows: PatientFixture[] }) {
  const calls: Array<[string, ...unknown[]]> = [];
  let clinicFilter = "";
  const terms: string[] = [];
  let limit = 0;
  const builder = {
    select: (columns: string) => { calls.push(["select", columns]); return builder; },
    eq: (column: string, value: string) => { calls.push(["eq", column, value]); if (column === "clinic_id") clinicFilter = value; return builder; },
    ilike: (column: string, pattern: string) => { calls.push(["ilike", column, pattern]); terms.push(pattern.slice(1, -1).toLocaleLowerCase("es-MX")); return builder; },
    order: (column: string) => { calls.push(["order", column]); return builder; },
    limit: (count: number) => {
      calls.push(["limit", count]); limit = count;
      const data = rows.filter((row) => row.clinic_id === clinicFilter && (role !== "doctor" || row.assignedTo.includes(doctorId))
        && terms.every((term) => row.full_name.toLocaleLowerCase("es-MX").includes(term)))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)).slice(0, limit)
        .map(({ id, full_name }) => ({ id, full_name }));
      return Promise.resolve({ data, error: null });
    }
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/assistant/orchestration/patient-selection": { ASSISTANT_PATIENT_SUGGESTION_LIMIT, parseAssistantPatientQuery },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", tenant: { clinic: { id: clinicId }, membership: { id: doctorId, role } } }) },
    "@/lib/supabase/server": { createClient: async () => ({ from: (table: string) => { calls.push(["from", table]); return builder; } }) },
    "@/lib/logger": { logger: { error: () => {} } }
  };
  const source = readFileSync("lib/server/patients.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions: Record<string, (...args: unknown[]) => Promise<any>> = {};
  runInNewContext(output, { exports: actions, require: (name: string) => mocks[name] ?? {} });
  return { search: actions.searchAssistantPatientNamesForActiveTenant, calls };
}

const fixtures: PatientFixture[] = [
  { id: patientId, full_name: "Juan Pérez González", clinic_id: clinicId, assignedTo: [doctorId] },
  { id: otherPatientId, full_name: "Juana Pérez López", clinic_id: clinicId, assignedTo: [anotherDoctorId] },
  { id: "77777777-7777-4777-8777-777777777777", full_name: "Juan Carlos Martínez", clinic_id: clinicId, assignedTo: [] },
  { id: "88888888-8888-4888-8888-888888888888", full_name: "Juan Cross Tenant", clinic_id: "99999999-9999-4999-8999-999999999999", assignedTo: [doctorId] }
];

test("name-only lookup supports partial, case-insensitive and surname terms", async () => {
  const { search, calls } = loadPatientSearch({ role: "admin", rows: fixtures });
  const juan = await search("juan", doctorId);
  assert.equal(juan.state, "ready");
  assert.equal(juan.data.patients.length, 3);
  assert.ok(juan.data.patients.every((row: Record<string, unknown>) => Object.keys(row).sort().join() === "id,name"));
  assert.deepEqual(calls.find((call) => call[0] === "select"), ["select", "id, full_name"]);
  assert.deepEqual(calls.find((call) => call[0] === "eq"), ["eq", "clinic_id", clinicId]);
  assert.equal((await search("Pérez", doctorId)).data.patients.length, 2);
  assert.equal((await search("Juan Pérez G", doctorId)).data.patients.length, 1);
  assert.equal((await search("Nadie", doctorId)).data.patients.length, 0);
});

test("doctor lookup remains in own patient RLS scope and rejects another professional", async () => {
  const { search, calls } = loadPatientSearch({ role: "doctor", rows: fixtures });
  const result = await search("Juan", doctorId);
  assert.deepEqual(result.data.patients.map((row: { id: string }) => row.id), [patientId]);
  assert.equal((await search("Juan", anotherDoctorId)).state, "forbidden");
  assert.equal(calls.some((call) => call[0] === "from" && call[1] !== "patients"), false);
});

test("assistant keeps clinic-wide scheduling directory including unassigned first appointments", async () => {
  const { search } = loadPatientSearch({ role: "assistant", rows: fixtures });
  const result = await search("Juan", doctorId);
  assert.equal(result.data.patients.length, 3);
  assert.ok(result.data.patients.some((row: { id: string }) => row.id === fixtures[2].id));
  assert.ok(!result.data.patients.some((row: { id: string }) => row.id === fixtures[3].id));
});

test("lookup is bounded to eight suggestions, with more flag", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `test-${i}`, full_name: `Juan ${i}`, clinic_id: clinicId, assignedTo: [] }));
  const { search, calls } = loadPatientSearch({ role: "owner", rows });
  const result = await search("Juan");
  assert.equal(result.data.patients.length, 8);
  assert.equal(result.data.hasMore, true);
  assert.deepEqual(calls.find((call) => call[0] === "limit"), ["limit", 9]);
});

test("autocomplete and structured patient choice avoid the planner and only prepare a proposal", async () => {
  let providerCalls = 0;
  let prepared = 0;
  let executed = 0;
  let lookupCalls = 0;
  const search = async (query: unknown) => {
    lookupCalls++;
    const value = String(query).toLocaleLowerCase("es-MX");
    return { state: "ready", data: { patients: fixtures.filter((row) => row.clinic_id === clinicId && row.full_name.toLocaleLowerCase("es-MX").includes(value)).map((row) => ({ id: row.id, name: row.full_name })), hasMore: false } };
  };
  const readTool = async (name: string) => {
    if (name === "get_professionals") return { ok: true, data: [{ professional_clinic_member_id: doctorId, professional_user_id: actorId, display_name: "QA Doctor" }] };
    if (name === "get_available_slots") return { ok: true, data: [{ local_start: "10:30", local_end: "11:00" }] };
    throw new Error(`Unexpected read: ${name}`);
  };
  const mocks: Record<string, unknown> = {
    "@/lib/assistant/orchestration/context": schedulingContext,
    "@/lib/assistant/orchestration/conversation": conversation,
    "@/lib/assistant/orchestration/structured-selection": structuredSelection,
    "@/lib/assistant/orchestration/intents": { resolveUniqueEntity },
    "@/lib/assistant/parser/deterministic": parser,
    "@/lib/assistant/llm/domain-gate": domainGate,
    "@/lib/assistant/llm/gated-planner": { runGatedAssistantPlanner: async () => { providerCalls++; throw new Error("Planner called"); } },
    "@/lib/assistant/orchestration/read-tools": { shouldOrchestrateAssistantReads: () => false },
    "@/lib/assistant/tools/registry": {
      getAssistantToolContext: async () => ({ ok: true, data: { userId: actorId, clinicId, role: "assistant", isProfessional: false, timeZone: "America/Mexico_City" } }),
      executeAssistantReadTool: readTool,
      getCreateAppointmentProposalPresentation: async () => ({ ok: true, data: { patient: "QA Patient", professional: "QA Doctor" } }),
      prepareAssistantMutation: async () => { prepared++; return { ok: true, data: { actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }; },
      executeConfirmedAssistantAction: async () => { executed++; throw new Error("Unexpected mutation"); }
    },
    "@/lib/appointments/query": { isCanonicalAppointmentUuid },
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: today }) },
    "@/lib/server/patients": { isPatientAvailableForActiveTenant: async (id: string) => id === patientId || id === otherPatientId, searchAssistantPatientNamesForActiveTenant: search },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({}), planIncludesFeature: () => true },
    "@/lib/logger": { logger: { info: () => {}, error: () => {} } }
  };
  const output = ts.transpileModule(readFileSync("app/dashboard/bot/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions: Record<string, (...args: any[]) => Promise<any>> = {};
  runInNewContext(output, { exports: actions, process: { env: { APPOINTMENT_ASSISTANT_LLM_ENABLED: "true" } }, Date, Intl, require: (name: string) => mocks[name] ?? {} });
  const completeContext = { ...context, focusedProfessionalRef: doctorId, localDate: "2026-09-28", startTime: "10:30", updatedAt: Date.now() };
  const suggestions = await actions.searchAssistantPatientSuggestionsAction("Juan", completeContext);
  assert.equal(suggestions.state, "ready");
  assert.equal(suggestions.suggestions.length, 3);
  assert.equal(providerCalls, 0);
  assert.equal(prepared, 0);
  const planned = await actions.planAssistantConversationWithContextAction("QA Patient N-D1-01", completeContext);
  assert.equal(planned.resolved.state, "parsed");
  assert.equal(planned.resolved.result.state, "intent");
  assert.equal(planned.resolved.result.intent.patientQuery, "QA Patient N-D1-01");
  assert.equal(providerCalls, 0);
  const zero = await actions.submitAssistantIntentAction({ ...intentFromAssistantContext(completeContext), patientQuery: "Nadie" });
  assert.equal(zero.state, "message");
  assert.match(zero.message, /No encontré pacientes/);
  const multiple = await actions.submitAssistantIntentAction({ ...intentFromAssistantContext(completeContext), patientQuery: "Juan" });
  assert.equal(multiple.state, "choices");
  assert.equal(multiple.choices.length, 3);
  assert.equal(prepared, 0);
  const clicked = await actions.selectAssistantResultWithContextAction(multiple.choices[0].choice, completeContext);
  assert.equal(clicked.response.state, "proposal");
  assert.equal(clicked.context.focusedProfessionalRef, doctorId);
  assert.equal(clicked.context.localDate, "2026-09-28");
  assert.equal(clicked.context.startTime, "10:30");
  assert.equal(prepared, 1);
  assert.equal(executed, 0);
  assert.equal(providerCalls, 0);
  const unique = await actions.submitAssistantIntentAction({ ...intentFromAssistantContext(completeContext), patientQuery: "Juan Pérez González" });
  assert.equal(unique.state, "proposal");
  assert.equal(prepared, 2);
  assert.ok(lookupCalls >= 3);
});
