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
