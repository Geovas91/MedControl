import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/dashboard/bot/page.tsx", "utf8");
const component = readFileSync("components/bot/appointment-assistant.tsx", "utf8");
const actions = readFileSync("app/dashboard/bot/actions.ts", "utf8");

test("assistant UI is additive and keeps automation/activity accessible", () => {
  assert.match(page, /AppointmentAssistant/);
  assert.match(page, /id="assistant"/);
  assert.match(page, /id="automation"/);
  assert.match(page, /AppointmentAutomationLiveStatusPanel/);
  assert.match(component, /Sin chat persistente/);
});

test("proposal controls use durable actionId-only server boundaries", () => {
  assert.match(component, /confirmAssistantProposalAction\(proposal\.proposal\.actionId\)/);
  assert.match(component, /cancelAssistantProposalAction\(proposal\.proposal\.actionId\)/);
  assert.doesNotMatch(component, /confirmAssistantProposalAction\([^)]*,/);
  assert.match(actions, /executeConfirmedAssistantAction\(actionId\)/);
  assert.match(actions, /cancelAssistantPendingAction\(actionId\)/);
  assert.match(actions, /revalidatePath\("\/dashboard\/appointments"\)/);
});

test("UI exposes safe accessibility and loading behavior", () => {
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-label="Propuesta pendiente de confirmación"/);
  assert.match(component, /disabled=\{isPending\}/);
  assert.match(component, /focus-visible:ring/);
});

test("UI gives recognized intents precedence over follow-up state and supports reset", () => {
  assert.match(component, /resolveConversationInput\(pendingIntent, text, today\)/);
  assert.match(component, /Empecemos una nueva consulta/);
  assert.match(component, /setPendingIntent\(null\)/);
});

test("pending entity helper commands use a read action and preserve the pending intent", () => {
  assert.match(component, /classifyContextualHelper\(pendingIntent, text\)/);
  assert.match(component, /submitAssistantContextualHelperAction\(intent, helper\)/);
  assert.match(actions, /state: "choices", field: "patient"/);
  assert.match(actions, /state: "choices", field: "professional"/);
});

test("professional lookup uses the protected internal members projection", () => {
  const registry = readFileSync("lib/assistant/tools/registry.ts", "utf8");
  assert.match(registry, /list_clinic_members_for_current_user/);
  assert.doesNotMatch(registry, /getAppointmentCreationOptions/);
  assert.match(registry, /is_professional/);
});

test("appointment creation derives self professional from authenticated context", () => {
  assert.match(actions, /getAssistantToolContext\(\)/);
  assert.match(actions, /getDefaultSchedulingProfessional\(context\.data\)/);
  assert.match(actions, /professionalClinicMemberId: defaultProfessionalId/);
  assert.match(actions, /Agendaremos la cita contigo/);
});
