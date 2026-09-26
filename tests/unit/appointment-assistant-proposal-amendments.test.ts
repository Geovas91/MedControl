import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateAssistantDomainGate } from "../../lib/assistant/llm/domain-gate.ts";
import { amendPendingProposalIntent } from "../../lib/assistant/orchestration/conversation.ts";
import type { AssistantIntent } from "../../lib/assistant/orchestration/intents.ts";

const pendingCreateProposal: AssistantIntent = {
  type: "create_appointment",
  patientId: "11111111-1111-4111-8111-111111111111",
  professionalClinicMemberId: "22222222-2222-4222-8222-222222222222",
  localDate: "2026-09-29",
  localTime: "11:45",
  durationMinutes: 30
};

test("staging regression: a complete pending proposal accepts a professional amendment", () => {
  const result = evaluateAssistantDomainGate({
    message: "Mejor con QA Doctor 3 Norte",
    today: "2026-09-25",
    pending: pendingCreateProposal
  });

  assert.equal(result.state, "allowed");
  if (result.state === "allowed") {
    assert.equal(result.reasonCode, "contextual_follow_up");
    assert.equal(result.intentCategory, "create_appointment");
  }
});

test("professional replacement preserves patient/date and clears the incompatible professional slot", () => {
  const amended = amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Mejor con QA Doctor 3 Norte", clinicLocalDate: "2026-09-25" });
  assert.equal(amended?.field, "professional");
  assert.deepEqual(amended?.intent, {
    type: "create_appointment",
    patientId: pendingCreateProposal.patientId,
    professionalClinicMemberId: undefined,
    professionalQuery: "QA Doctor 3 Norte",
    localDate: "2026-09-29",
    localTime: undefined,
    durationMinutes: 30
  });
});

test("date replacement preserves patient/professional and clears the old time", () => {
  const amended = amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Mejor mañana", clinicLocalDate: "2026-09-25" });
  assert.equal(amended?.field, "localDate");
  assert.equal(amended?.intent.type, "create_appointment");
  if (amended?.intent.type === "create_appointment") {
    assert.equal(amended.intent.patientId, pendingCreateProposal.patientId);
    assert.equal(amended.intent.professionalClinicMemberId, pendingCreateProposal.professionalClinicMemberId);
    assert.equal(amended.intent.localDate, "2026-09-26");
    assert.equal(amended.intent.localTime, undefined);
  }
});

test("time and patient replacements preserve compatible fields", () => {
  const time = amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Mejor a las 5", clinicLocalDate: "2026-09-25" });
  assert.equal(time?.field, "localTime");
  if (time?.intent.type === "create_appointment") {
    assert.equal(time.intent.patientId, pendingCreateProposal.patientId);
    assert.equal(time.intent.professionalClinicMemberId, pendingCreateProposal.professionalClinicMemberId);
    assert.equal(time.intent.localDate, "2026-09-29");
    assert.equal(time.intent.localTime, "17:00");
  }

  const patient = amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Mejor para QA Patient N-D1-02", clinicLocalDate: "2026-09-25" });
  assert.equal(patient?.field, "patient");
  if (patient?.intent.type === "create_appointment") {
    assert.equal(patient.intent.patientId, undefined);
    assert.equal(patient.intent.patientQuery, "QA Patient N-D1-02");
    assert.equal(patient.intent.professionalClinicMemberId, pendingCreateProposal.professionalClinicMemberId);
    assert.equal(patient.intent.localTime, "11:45");
  }
  const spokenTime = amendPendingProposalIntent({ intent: pendingCreateProposal, message: "A las cinco", clinicLocalDate: "2026-09-25" });
  assert.equal(spokenTime?.field, "localTime");
  if (spokenTime?.intent.type === "create_appointment") assert.equal(spokenTime.intent.localTime, "17:00");
});

test("pending proposal context still rejects unrelated text before the provider", () => {
  for (const message of ["Cuéntame un chiste", "Cuál es la capital de Francia", "Explícame diabetes"]) {
    assert.equal(evaluateAssistantDomainGate({ message, today: "2026-09-25", pending: pendingCreateProposal }).state, "rejected", message);
  }
});

test("supported wording is narrow and explicit", () => {
  assert.equal(amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Cámbialo al Doctor 1", clinicLocalDate: "2026-09-25" })?.field, "professional");
  const other = amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Otro doctor", clinicLocalDate: "2026-09-25" });
  assert.equal(other?.field, "professional");
  if (other?.intent.type === "create_appointment") {
    assert.equal(other.intent.professionalClinicMemberId, undefined);
    assert.equal(other.intent.localTime, undefined);
  }
  assert.equal(amendPendingProposalIntent({ intent: pendingCreateProposal, message: "Explícame diabetes", clinicLocalDate: "2026-09-25" }), null);
});

test("server invalidates the durable proposal before resolving amended data", () => {
  const actions = readFileSync("app/dashboard/bot/actions.ts", "utf8");
  const flow = actions.slice(actions.indexOf("export async function planAssistantConversationWithContextAction"), actions.indexOf("export async function submitAssistantIntentWithContextAction"));
  assert.ok(flow.indexOf("cancelAssistantPendingAction(pendingProposalActionId)") < flow.indexOf("const contextual = amendment?.intent"));
  assert.match(flow, /\["cancelled", "expired"\]\.includes\(cancelled\.data\.status\)/);
  assert.match(flow, /proposalDisposition = await invalidateProposal\(\)/);
  assert.match(flow, /return "invalidated" as const/);
  const component = readFileSync("components/bot/appointment-assistant.tsx", "utf8");
  assert.match(component, /planAssistantConversationWithContextAction\(text, contextRef\.current, proposal\?\.proposal\.actionId\)/);
  assert.match(component, /proposalDisposition === "invalidated"[\s\S]*setProposal\(null\)/);
});

test("requested time still crosses real slot validation before a replacement proposal", () => {
  const actions = readFileSync("app/dashboard/bot/actions.ts", "utf8");
  const create = actions.slice(actions.indexOf('if (intent.type === "create_appointment")'), actions.indexOf('if (intent.type !== "confirm_appointment"'));
  assert.ok(create.indexOf('readTool<ReadSlot[]>("get_available_slots"') < create.indexOf('prepareAssistantMutation("create_appointment"'));
  assert.match(create, /!slots\.data\.some\(\(slot\) => slot\.local_start === resolvedIntent\.localTime\)[\s\S]*availabilityRetryResponse/);
  assert.match(create, /!resolvedIntent\.localTime[\s\S]*state: "slots"/);
});

test("planner-resolved mutation supersedes the old proposal before UI can submit a second one", () => {
  const actions = readFileSync("app/dashboard/bot/actions.ts", "utf8");
  const flow = actions.slice(actions.indexOf("export async function planAssistantConversationWithContextAction"), actions.indexOf("export async function submitAssistantIntentWithContextAction"));
  const plannerResult = flow.indexOf("await planAssistantConversationAction(text");
  const invalidate = flow.indexOf("proposalDisposition = await invalidateProposal()", plannerResult);
  assert.ok(plannerResult >= 0 && invalidate > plannerResult);
  assert.ok(invalidate < flow.indexOf("conversationContext = updateAssistantConversationContext(conversationContext, resolved.result.intent"));
  assert.match(flow, /sameAction\)[\s\S]*La propuesta conserva esos datos/);
});
