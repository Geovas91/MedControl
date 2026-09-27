import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as parser from "../../lib/assistant/parser/deterministic.ts";
import { parseDateExpression, resolveSchedulingDateExpression } from "../../lib/assistant/parser/deterministic.ts";
import * as schedulingContext from "../../lib/assistant/orchestration/context.ts";
import { contextualSchedulingFollowUp, intentFromAssistantContext, newAssistantConversationContext, parseSchedulingContextPatch, readAssistantConversationContext, reconcileSchedulingContext, updateAssistantConversationContext, type AssistantConversationContext } from "../../lib/assistant/orchestration/context.ts";
import * as domainGate from "../../lib/assistant/llm/domain-gate.ts";
import { evaluateAssistantDomainGate } from "../../lib/assistant/llm/domain-gate.ts";
import * as structuredSelection from "../../lib/assistant/orchestration/structured-selection.ts";
import { resolveAssistantStructuredChoice } from "../../lib/assistant/orchestration/structured-selection.ts";
import * as conversation from "../../lib/assistant/orchestration/conversation.ts";
import { resolveUniqueEntity } from "../../lib/assistant/orchestration/intents.ts";
import { isCanonicalAppointmentUuid } from "../../lib/appointments/query.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const professionalId = "44444444-4444-4444-8444-444444444444";
const otherProfessionalId = "55555555-5555-4555-8555-555555555555";
const clinicToday = "2026-09-25";
const timeZone = "America/Mexico_City";
const createContext = () => ({ ...newAssistantConversationContext({ actorId, clinicId }), activeIntent: "create_appointment" as const, durationMinutes: 30 });

function turn(context: AssistantConversationContext, message: string) {
  const gate = evaluateAssistantDomainGate({ message, today: clinicToday, pending: intentFromAssistantContext(context) });
  assert.equal(gate.state, "allowed", message);
  if (gate.state !== "allowed") throw new Error("Turn was rejected");
  const parsed = parseSchedulingContextPatch(gate.message, context, clinicToday);
  assert.equal(parsed.state, "patch", message);
  if (parsed.state !== "patch") throw new Error("Turn had no patch");
  const reconciled = reconcileSchedulingContext(context, parsed.patch, timeZone);
  assert.ok(reconciled);
  return { ...reconciled, patch: parsed.patch };
}

test("staging repro: availability on Monday retains the create goal, patient and professional", () => {
  const context = {
    ...newAssistantConversationContext({ actorId, clinicId }),
    activeIntent: "create_appointment" as const,
    focusedPatientRef: patientId,
    focusedProfessionalRef: professionalId,
    durationMinutes: 30
  };
  const followUp = contextualSchedulingFollowUp("Que horarios tiene disponible para el dia lunes", context, "2026-09-25");
  assert.deepEqual(followUp, {
    type: "create_appointment",
    patientId,
    professionalClinicMemberId: professionalId,
    localDate: "2026-09-28",
    localTime: undefined,
    durationMinutes: 30
  });
});

test("named weekday resolves from the clinic-local date inside a full sentence", () => {
  assert.equal(parseDateExpression("Que horarios tiene disponible para el dia lunes", "2026-09-25"), "2026-09-28");
});

test("all seven named weekdays and common qualifiers use the clinic-local calendar", () => {
  const expected = ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-09-26"];
  const names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  names.forEach((name, index) => assert.equal(parseDateExpression(`el ${name}`, clinicToday), expected[index]));
  assert.equal(parseDateExpression("este lunes", clinicToday), "2026-09-28");
  assert.equal(parseDateExpression("próximo lunes", clinicToday), "2026-09-28");
  assert.equal(parseDateExpression("el próximo lunes", "2026-09-28"), "2026-10-05");
  assert.equal(parseDateExpression("hoy", clinicToday), clinicToday);
  assert.equal(parseDateExpression("mañana", clinicToday), "2026-09-26");
  assert.equal(parseDateExpression("pasado mañana", clinicToday), "2026-09-27");
  assert.equal(parseDateExpression("2026-09-29", clinicToday), "2026-09-29");
  assert.equal(parseDateExpression("29/09/2026", clinicToday), "2026-09-29");
});

test("conflicting date candidates request clarification instead of choosing a weekday", () => {
  assert.deepEqual(resolveSchedulingDateExpression("lunes o martes", clinicToday), { state: "ambiguous" });
  assert.deepEqual(resolveSchedulingDateExpression("lunes 29/09/2026", clinicToday), { state: "ambiguous" });
  assert.equal(parseSchedulingContextPatch("lunes o martes", createContext(), clinicToday).state, "ambiguous");
});

test("an explicit new goal is not reduced to a contextual date patch", () => {
  const context = { ...createContext(), focusedPatientRef: patientId, focusedProfessionalRef: professionalId };
  assert.equal(parseSchedulingContextPatch("Agenda una cita mañana", context, clinicToday).state, "none");
  assert.equal(parseSchedulingContextPatch("Dame mis citas de hoy", context, clinicToday).state, "none");
  assert.equal(parseSchedulingContextPatch("Qué horarios tiene el lunes", context, clinicToday).state, "patch");
});

test("availability is a turn intent within the create goal and preserves the resolved patient", () => {
  const context = { ...createContext(), focusedPatientRef: patientId, focusedProfessionalRef: professionalId };
  const next = turn(context, "Qué horarios tiene disponible para el día lunes");
  assert.equal(next.patch.turnIntent, "request_availability");
  assert.equal(next.intent.type, "create_appointment");
  assert.equal(next.context.activeIntent, "create_appointment");
  assert.equal(next.context.focusedPatientRef, patientId);
  assert.equal(next.context.focusedProfessionalRef, professionalId);
  assert.equal(next.context.localDate, "2026-09-28");
});

test("date and professional changes keep compatible fields and invalidate stale slots", () => {
  const original = { ...createContext(), focusedPatientRef: patientId, focusedProfessionalRef: professionalId, localDate: "2026-09-28", startTime: "10:30", selectedSlot: { professionalRef: professionalId, localDate: "2026-09-28", startTime: "10:30", durationMinutes: 30 }, availableSlotTimes: ["10:30"] };
  const tuesday = turn(original, "¿Y el martes?");
  assert.equal(tuesday.context.localDate, "2026-09-29");
  assert.equal(tuesday.context.focusedPatientRef, patientId);
  assert.equal(tuesday.context.focusedProfessionalRef, professionalId);
  assert.equal(tuesday.context.selectedSlot, undefined);
  assert.equal(tuesday.context.availableSlotTimes, undefined);
  assert.equal(tuesday.context.startTime, undefined);
  const doctor3 = turn(original, "Mejor con Doctor 3");
  assert.equal(doctor3.context.localDate, "2026-09-28");
  assert.equal(doctor3.context.focusedPatientRef, patientId);
  assert.equal(doctor3.context.focusedProfessionalRef, undefined);
  assert.equal(doctor3.context.selectedSlot, undefined);
  assert.equal(doctor3.context.startTime, undefined);
  assert.equal(doctor3.intent.type, "create_appointment");
  if (doctor3.intent.type === "create_appointment") assert.equal(doctor3.intent.professionalQuery, "doctor 3");
  const newPatient = turn(original, "Para Juan");
  assert.equal(newPatient.context.focusedPatientRef, undefined);
  assert.equal(newPatient.context.focusedProfessionalRef, professionalId);
  assert.equal(newPatient.context.selectedSlot?.startTime, "10:30");
});

test("natural slot filling orders converge without losing the creation goal", () => {
  for (const order of [
    ["Para Juan", "Con QA Doctor 2 Norte", "el lunes"],
    ["Con QA Doctor 2 Norte", "el lunes", "Para Juan"],
    ["el lunes", "Con QA Doctor 2 Norte", "Para Juan"]
  ]) {
    let context: AssistantConversationContext = createContext();
    for (const message of order) {
      const next = turn(context, message);
      context = next.context;
      if (next.intent.type === "create_appointment" && next.intent.patientQuery) context = updateAssistantConversationContext(context, { ...next.intent, patientId, patientQuery: undefined }, { state: "message", resolvedPatientRef: patientId }, timeZone);
      if (next.intent.type === "create_appointment" && next.intent.professionalQuery) context = updateAssistantConversationContext(context, { ...next.intent, professionalClinicMemberId: professionalId, professionalQuery: undefined }, { state: "message", resolvedProfessionalRef: professionalId }, timeZone);
    }
    assert.equal(context.activeIntent, "create_appointment", order.join(" → "));
    assert.equal(context.focusedPatientRef, patientId, order.join(" → "));
    assert.equal(context.focusedProfessionalRef, professionalId, order.join(" → "));
    assert.equal(context.localDate, "2026-09-28", order.join(" → "));
  }
});

test("professional then availability and patient then weekday preserve their partial goals", () => {
  const professionalFirst = { ...createContext(), focusedProfessionalRef: professionalId };
  const slots = turn(professionalFirst, "¿Qué tiene libre el martes?");
  assert.equal(slots.intent.type, "create_appointment");
  assert.equal(slots.context.focusedProfessionalRef, professionalId);
  assert.equal(slots.context.localDate, "2026-09-29");
  const patientFirst = { ...createContext(), focusedPatientRef: patientId };
  const date = turn(patientFirst, "el miércoles");
  assert.equal(date.context.focusedPatientRef, patientId);
  assert.equal(date.context.localDate, "2026-09-30");
});

test("structured slot choice preserves the create goal without invoking a planner", async () => {
  let slotChecks = 0;
  const result = await resolveAssistantStructuredChoice(
    { kind: "available_slot", label: "10:00–10:30", professionalReference: professionalId, localDate: "2026-09-28", startTime: "10:00", endTime: "10:30", durationMinutes: 30 },
    { type: "create_appointment", patientId, professionalClinicMemberId: professionalId, localDate: "2026-09-28", durationMinutes: 30 },
    { patient: async () => false, professional: async () => null, appointment: async () => null, slot: async () => { slotChecks++; return { valid: true }; } }
  );
  assert.equal(slotChecks, 1);
  assert.equal(result.state, "continue");
  if (result.state === "continue" && result.intent.type === "create_appointment") {
    assert.equal(result.intent.patientId, patientId);
    assert.equal(result.intent.localTime, "10:00");
  }
});

test("the domain gate admits contextual scheduling and rejects unrelated tasks", () => {
  const pending = intentFromAssistantContext({ ...createContext(), focusedPatientRef: patientId, focusedProfessionalRef: professionalId });
  for (const message of ["Qué horarios tiene el lunes", "¿Y el martes?", "Qué tiene libre", "con otro doctor"]) assert.equal(evaluateAssistantDomainGate({ message, today: clinicToday, pending }).state, "allowed", message);
  for (const message of ["cuéntame un chiste", "capital de Francia", "explícame diabetes", "programa en Python"]) assert.equal(evaluateAssistantDomainGate({ message, today: clinicToday, pending }).state, "rejected", message);
  assert.equal(readAssistantConversationContext(null, { actorId, clinicId }).reason, "created");
});

test("server action reaches real slot lookup for the staging sentence with zero planner calls", async () => {
  let providerCalls = 0;
  let slotReads = 0;
  let proposals = 0;
  let professionals = [{ professional_clinic_member_id: professionalId, professional_user_id: actorId, display_name: "QA Doctor 2 Norte" }];
  const readTool = async (name: string) => {
    if (name === "get_professionals") return { ok: true, data: professionals };
    if (name === "get_available_slots") { slotReads++; return { ok: true, data: [{ local_start: "10:00", local_end: "10:30" }] }; }
    throw new Error(`Unexpected read tool: ${name}`);
  };
  const mocks: Record<string, unknown> = {
    "@/lib/assistant/orchestration/context": schedulingContext,
    "@/lib/assistant/orchestration/conversation": conversation,
    "@/lib/assistant/orchestration/structured-selection": structuredSelection,
    "@/lib/assistant/orchestration/intents": { resolveUniqueEntity },
    "@/lib/assistant/parser/deterministic": parser,
    "@/lib/assistant/llm/domain-gate": domainGate,
    "@/lib/assistant/llm/gated-planner": { runGatedAssistantPlanner: async () => { providerCalls++; throw new Error("Unexpected planner call"); } },
    "@/lib/assistant/orchestration/read-tools": { shouldOrchestrateAssistantReads: () => false },
    "@/lib/assistant/tools/registry": {
      getAssistantToolContext: async () => ({ ok: true, data: { userId: actorId, clinicId, role: "assistant", isProfessional: false, timeZone } }),
      executeAssistantReadTool: readTool,
      getCreateAppointmentProposalPresentation: async () => ({ ok: true, data: { patient: "Paciente QA", professional: "Doctor QA" } }),
      prepareAssistantMutation: async () => { proposals++; return { ok: true, data: { actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }; }
    },
    "@/lib/appointments/query": { isCanonicalAppointmentUuid },
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: clinicToday }) },
    "@/lib/server/patients": {
      isPatientAvailableForActiveTenant: async () => true,
      isPatientEligibleForSchedulingWithProfessionalActiveTenant: async () => true,
      getPatientEligibleProfessionalIdsForSchedulingActiveTenant: async () => ({ state: "ready", ids: professionals.map((professional) => professional.professional_clinic_member_id) })
    },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({}), planIncludesFeature: () => true },
    "@/lib/logger": { logger: { info: () => {} } }
  };
  const output = ts.transpileModule(readFileSync("app/dashboard/bot/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions: Record<string, (...args: any[]) => Promise<any>> = {};
  runInNewContext(output, { exports: actions, process: { env: { APPOINTMENT_ASSISTANT_LLM_ENABLED: "true", APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED: "true" } }, Date, Intl, require: (name: string) => mocks[name] ?? {} });
  const context = { ...createContext(), focusedPatientRef: patientId, focusedProfessionalRef: professionalId, updatedAt: Date.now() };
  const planned = await actions.planAssistantConversationWithContextAction("Que horarios tiene disponible para el dia lunes", context);
  assert.equal(providerCalls, 0);
  assert.equal(planned.resolved.state, "parsed");
  assert.equal(planned.resolved.result.state, "intent");
  assert.equal(planned.resolved.result.intent.type, "create_appointment");
  assert.equal(planned.context.activeIntent, "create_appointment");
  assert.equal(planned.context.focusedPatientRef, patientId);
  const submitted = await actions.submitAssistantIntentWithContextAction(planned.resolved.result.intent, planned.context);
  assert.equal(submitted.response.state, "slots");
  assert.equal(submitted.response.date, "2026-09-28");
  assert.equal(submitted.response.slots[0].choice.kind, "available_slot");
  assert.equal(submitted.context.focusedPatientRef, patientId);
  assert.equal(submitted.context.activeIntent, "create_appointment");
  assert.equal(slotReads, 1);
  assert.equal(providerCalls, 0);
  assert.equal(proposals, 0);
  const beforePatient = await actions.submitAssistantIntentAction({ type: "create_appointment", professionalClinicMemberId: professionalId, localDate: "2026-09-28", durationMinutes: 30 });
  assert.equal(beforePatient.state, "slots");
  const clickedBeforePatient = await actions.selectAssistantResultAction(beforePatient.slots[0].choice, { type: "create_appointment", professionalClinicMemberId: professionalId, localDate: "2026-09-28", durationMinutes: 30 });
  assert.equal(clickedBeforePatient.state, "message");
  assert.match(clickedBeforePatient.message, /paciente/);
  assert.equal(proposals, 0);
  const selected = await actions.selectAssistantResultWithContextAction(submitted.response.slots[0].choice, submitted.context);
  assert.equal(selected.response.state, "proposal");
  assert.equal(selected.context.focusedPatientRef, patientId);
  assert.equal(providerCalls, 0);
  assert.equal(proposals, 1);
  professionals = [professionals[0], { professional_clinic_member_id: otherProfessionalId, professional_user_id: otherProfessionalId, display_name: "QA Doctor 3 Norte" }];
  const ambiguous = await actions.submitAssistantIntentAction({ type: "create_appointment", patientId, professionalQuery: "Doctor", localDate: "2026-09-28", durationMinutes: 30 });
  assert.equal(ambiguous.state, "choices");
  assert.equal(ambiguous.field, "professional");
  assert.equal(ambiguous.choices.length, 2);
  assert.equal(proposals, 1);
});
