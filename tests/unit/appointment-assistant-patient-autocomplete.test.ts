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

type PatientFixture = { id: string; full_name: string; clinic_id: string; assignedTo: string[]; archived?: boolean };

function loadPatientSearch({ role, rows }: { role: "doctor" | "assistant" | "admin" | "owner"; rows: PatientFixture[] }) {
  const calls: Array<[string, ...unknown[]]> = [];
  let clinicFilter = "";
  const terms: string[] = [];
  let limit = 0;
  const builder = {
    select: (columns: string) => { calls.push(["select", columns]); terms.length = 0; return builder; },
    eq: (column: string, value: string) => { calls.push(["eq", column, value]); if (column === "clinic_id") clinicFilter = value; return builder; },
    ilike: (column: string, pattern: string) => { calls.push(["ilike", column, pattern]); terms.push(pattern.slice(1, -1).toLocaleLowerCase("es-MX")); return builder; },
    order: (column: string) => { calls.push(["order", column]); return builder; },
    limit: (count: number) => {
      calls.push(["limit", count]); limit = count;
      const data = rows.filter((row) => row.clinic_id === clinicFilter && !row.archived && (role !== "doctor" || row.assignedTo.includes(doctorId))
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
    "@/lib/supabase/server": { createClient: async () => ({
      from: (table: string) => { calls.push(["from", table]); return builder; },
      rpc: async (name: string, args: { p_clinic_id: string; p_professional_clinic_member_id: string; p_query?: string; p_limit?: number; p_patient_id?: string }) => {
        calls.push(["rpc", name, args]);
        if (name === "is_patient_eligible_for_scheduling") {
          const row = rows.find((patient) => patient.id === args.p_patient_id && patient.clinic_id === args.p_clinic_id && !patient.archived);
          return { data: Boolean(row && (role !== "doctor" || args.p_professional_clinic_member_id === doctorId)
            && (row.assignedTo.includes(args.p_professional_clinic_member_id) || role !== "doctor" && row.assignedTo.length === 0)), error: null };
        }
        if (name !== "search_patient_names_for_scheduling" || !args.p_query || !args.p_limit) throw new Error(`Unexpected RPC: ${name}`);
        const terms = args.p_query.toLocaleLowerCase("es-MX").split(" ");
        const data = rows.filter((row) => row.clinic_id === args.p_clinic_id && !row.archived
          && terms.every((term) => row.full_name.toLocaleLowerCase("es-MX").includes(term))
          && (row.assignedTo.includes(args.p_professional_clinic_member_id) || role !== "doctor" && row.assignedTo.length === 0))
          .sort((a, b) => a.full_name.localeCompare(b.full_name)).slice(0, Math.min(args.p_limit, 9))
          .map((row) => ({ patient_id: row.id, display_name: row.full_name }));
        return { data, error: null };
      }
    }) },
    "@/lib/logger": { logger: { error: () => {} } }
  };
  const source = readFileSync("lib/server/patients.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions: Record<string, (...args: unknown[]) => Promise<any>> = {};
  runInNewContext(output, { exports: actions, require: (name: string) => mocks[name] ?? {} });
  return { search: actions.searchAssistantPatientNamesForActiveTenant, eligible: actions.isPatientEligibleForSchedulingWithProfessionalActiveTenant, calls };
}

const fixtures: PatientFixture[] = [
  { id: patientId, full_name: "Juan Pérez González", clinic_id: clinicId, assignedTo: [doctorId] },
  { id: otherPatientId, full_name: "Juana Pérez López", clinic_id: clinicId, assignedTo: [anotherDoctorId] },
  { id: "77777777-7777-4777-8777-777777777777", full_name: "Juan Carlos Martínez", clinic_id: clinicId, assignedTo: [] },
  { id: "88888888-8888-4888-8888-888888888888", full_name: "Juan Cross Tenant", clinic_id: "99999999-9999-4999-8999-999999999999", assignedTo: [doctorId] },
  { id: "99999999-9999-4999-8999-999999999998", full_name: "Juan Shared", clinic_id: clinicId, assignedTo: [doctorId, anotherDoctorId] },
  { id: "99999999-9999-4999-8999-999999999997", full_name: "Juan Archived", clinic_id: clinicId, assignedTo: [], archived: true }
];

test("without a selected professional, name-only lookup retains the existing RLS directory", async () => {
  const { search, calls } = loadPatientSearch({ role: "admin", rows: fixtures });
  const juan = await search("juan");
  assert.equal(juan.state, "ready");
  assert.equal(juan.data.patients.length, 4);
  assert.ok(juan.data.patients.every((row: Record<string, unknown>) => Object.keys(row).sort().join() === "id,name"));
  assert.deepEqual(calls.find((call) => call[0] === "select"), ["select", "id, full_name"]);
  assert.deepEqual(calls.find((call) => call[0] === "eq"), ["eq", "clinic_id", clinicId]);
  assert.equal((await search("Pérez")).data.patients.length, 2);
  assert.equal((await search("Juan Pérez G")).data.patients.length, 1);
  assert.equal((await search("Nadie")).data.patients.length, 0);
  assert.equal(calls.some((call) => call[0] === "rpc"), false);
});

test("selected professional uses the scoped RPC, preserving unassigned and multi-assigned patients", async () => {
  const { search, calls } = loadPatientSearch({ role: "owner", rows: fixtures });
  const result = await search("juan", doctorId);
  assert.deepEqual(result.data.patients.map((row: { id: string }) => row.id).sort(), [patientId, fixtures[2].id, fixtures[4].id].sort());
  assert.ok(!result.data.patients.some((row: { id: string }) => row.id === otherPatientId || row.id === fixtures[3].id || row.id === fixtures[5].id));
  assert.equal(calls.filter((call) => call[0] === "rpc").length, 1);
  assert.equal(calls.some((call) => call[0] === "from"), false);
});

test("doctor lookup remains in own patient RLS scope and rejects another professional", async () => {
  const { search, calls } = loadPatientSearch({ role: "doctor", rows: fixtures });
  const result = await search("Juan", doctorId);
  assert.deepEqual(result.data.patients.map((row: { id: string }) => row.id).sort(), [patientId, fixtures[4].id].sort());
  assert.equal((await search("Juan", anotherDoctorId)).state, "forbidden");
  assert.equal(calls.filter((call) => call[0] === "rpc").length, 1);
});

test("assistant sees selected professional patients plus unassigned first appointments", async () => {
  const { search } = loadPatientSearch({ role: "assistant", rows: fixtures });
  const result = await search("Juan", doctorId);
  assert.equal(result.data.patients.length, 3);
  assert.ok(result.data.patients.some((row: { id: string }) => row.id === fixtures[2].id));
  assert.ok(!result.data.patients.some((row: { id: string }) => row.id === otherPatientId || row.id === fixtures[3].id));
});

test("server helper sends only the active clinic and exact pair to the eligibility RPC", async () => {
  const { eligible, calls } = loadPatientSearch({ role: "assistant", rows: fixtures });
  assert.equal(await eligible(patientId, doctorId), true);
  assert.equal(await eligible(otherPatientId, doctorId), false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter((call) => call[0] === "rpc"))), [
    ["rpc", "is_patient_eligible_for_scheduling", { p_clinic_id: clinicId, p_professional_clinic_member_id: doctorId, p_patient_id: patientId }],
    ["rpc", "is_patient_eligible_for_scheduling", { p_clinic_id: clinicId, p_professional_clinic_member_id: doctorId, p_patient_id: otherPatientId }]
  ]);
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
  let activeRole: "owner" | "admin" | "assistant" | "doctor" = "assistant";
  const eligibilityCalls: Array<[string, string]> = [];
  const eligible = async (id: string, professional: string) => {
    eligibilityCalls.push([id, professional]);
    const row = fixtures.find((item) => item.id === id && item.clinic_id === clinicId && !item.archived);
    return Boolean(row && (activeRole !== "doctor" || professional === doctorId)
      && (row.assignedTo.includes(professional) || activeRole !== "doctor" && row.assignedTo.length === 0));
  };
  const search = async (query: unknown, professional?: string) => {
    lookupCalls++;
    const value = String(query).toLocaleLowerCase("es-MX");
    return { state: "ready", data: { patients: fixtures.filter((row) => row.clinic_id === clinicId && !row.archived && row.full_name.toLocaleLowerCase("es-MX").includes(value) && (!professional || row.assignedTo.includes(professional) || row.assignedTo.length === 0)).map((row) => ({ id: row.id, name: row.full_name })), hasMore: false } };
  };
  const readTool = async (name: string) => {
    if (name === "get_professionals") return { ok: true, data: [
      { professional_clinic_member_id: doctorId, professional_user_id: actorId, display_name: "QA Doctor 1" },
      { professional_clinic_member_id: anotherDoctorId, professional_user_id: anotherDoctorId, display_name: "QA Doctor 2" }
    ] };
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
      getAssistantToolContext: async () => ({ ok: true, data: { userId: actorId, clinicId, role: activeRole, isProfessional: activeRole === "doctor", professionalClinicMemberId: activeRole === "doctor" ? doctorId : null, timeZone: "America/Mexico_City" } }),
      executeAssistantReadTool: readTool,
      getCreateAppointmentProposalPresentation: async () => ({ ok: true, data: { patient: "QA Patient", professional: "QA Doctor" } }),
      prepareAssistantMutation: async () => { prepared++; return { ok: true, data: { actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }; },
      executeConfirmedAssistantAction: async () => { executed++; throw new Error("Unexpected mutation"); }
    },
    "@/lib/appointments/query": { isCanonicalAppointmentUuid },
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: today }) },
    "@/lib/server/patients": { isPatientAvailableForActiveTenant: async (id: string) => fixtures.some((row) => row.id === id && row.clinic_id === clinicId && !row.archived), isPatientEligibleForSchedulingWithProfessionalActiveTenant: eligible, searchAssistantPatientNamesForActiveTenant: search },
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
  const tampered = await actions.selectAssistantResultWithContextAction({ kind: "patient", label: "Juana Pérez López", reference: otherPatientId }, completeContext);
  assert.equal(tampered.response.state, "error", "a patient assigned only to another professional cannot reach Proposal");
  assert.equal(prepared, 2);
  assert.ok(eligibilityCalls.some(([id, professional]) => id === otherPatientId && professional === doctorId));
  assert.equal(tampered.context.focusedPatientRef, undefined);

  const initialPrepared = prepared;
  const pair = async (role: typeof activeRole, id: string, professional: string, expected: "error" | "proposal") => {
    activeRole = role;
    const response = await actions.submitAssistantIntentAction({ type: "create_appointment", patientId: id, professionalClinicMemberId: professional, localDate: "2026-09-28", localTime: "10:30", durationMinutes: 30 });
    assert.equal(response.state, expected, `${role}: ${id} with ${professional}`);
  };
  for (const role of ["owner", "admin", "assistant"] as const) {
    await pair(role, otherPatientId, doctorId, "error"); // other-professional-only
    await pair(role, patientId, doctorId, "proposal"); // selected-professional assignment
    await pair(role, fixtures[2].id, doctorId, "proposal"); // unassigned
    await pair(role, fixtures[4].id, doctorId, "proposal"); // shared
  }
  await pair("doctor", patientId, doctorId, "proposal");
  await pair("doctor", fixtures[2].id, doctorId, "error");
  await pair("doctor", patientId, anotherDoctorId, "error");
  await pair("assistant", fixtures[3].id, doctorId, "error"); // cross-tenant
  await pair("assistant", fixtures[5].id, doctorId, "error"); // archived

  activeRole = "assistant";
  const patientFirstContext = { ...context, focusedPatientRef: otherPatientId, localDate: "2026-09-28", startTime: "10:30", updatedAt: Date.now() };
  const professionalAfterPatient = await actions.selectAssistantResultWithContextAction({ kind: "professional", label: "QA Doctor 1", reference: doctorId }, patientFirstContext);
  assert.equal(professionalAfterPatient.response.state, "error", "patient-first selection must reject an incompatible professional");
  assert.equal(professionalAfterPatient.context.focusedProfessionalRef, undefined);
  const eligiblePatientFirst = await actions.selectAssistantResultWithContextAction({ kind: "professional", label: "QA Doctor 1", reference: doctorId }, { ...patientFirstContext, focusedPatientRef: patientId });
  assert.equal(eligiblePatientFirst.response.state, "proposal");
  const unassignedFirst = await actions.selectAssistantResultWithContextAction({ kind: "professional", label: "QA Doctor 1", reference: doctorId }, { ...patientFirstContext, focusedPatientRef: fixtures[2].id });
  assert.equal(unassignedFirst.response.state, "proposal");
  assert.ok(prepared > initialPrepared);
  assert.equal(providerCalls, 0);
  assert.equal(executed, 0);
});
