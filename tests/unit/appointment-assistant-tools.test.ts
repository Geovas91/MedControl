import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assistantToolNames, toolSchemas } from "../../lib/assistant/tools/contracts.ts";
import { planAppointmentMutation, planAppointmentProposal, resolveUniqueEntity } from "../../lib/assistant/orchestration/intents.ts";

const registry = readFileSync("lib/assistant/tools/registry.ts", "utf8");

test("assistant registry is closed to the approved scheduling tools", () => {
  assert.deepEqual(assistantToolNames, [
    "search_patients", "search_appointments", "get_appointment", "get_available_slots",
    "get_professionals", "create_appointment", "confirm_appointment", "reschedule_appointment", "cancel_appointment"
  ]);
  assert.match(registry, /assistantToolRegistry/);
  assert.match(registry, /if \(!tool\) return assistantToolError/);
  assert.doesNotMatch(registry, /createAdminClient|service_role|\.from\("appointments"\)\.insert/);
});

test("untrusted scheduling inputs require canonical identifiers and local clinic time", () => {
  assert.equal(toolSchemas.createAppointment.parse({ patientId: "not-an-id", professionalId: "20000000-0000-4000-8000-000000000001", date: "2026-09-15", startTime: "09:00", durationMinutes: 30, title: "Consulta" }), null);
  assert.equal(toolSchemas.availableSlots.parse({ professionalId: "20000000-0000-4000-8000-000000000001", date: "2026-09-15", durationMinutes: 17 }), null);
  assert.deepEqual(toolSchemas.lifecycle.parse({ appointmentId: "10000000-0000-4000-8000-000000000001", expectedStatus: "scheduled" }), { appointmentId: "10000000-0000-4000-8000-000000000001", expectedStatus: "scheduled" });
});

test("mutation tools remain confirmation-gated and derive context server-side", () => {
  assert.match(registry, /if \(tool\.mutation\) return assistantToolError\("confirmation_required"/);
  assert.match(registry, /getActiveTenantContext\(\)/);
  assert.match(registry, /claim_assistant_pending_action_for_current_user/);
  assert.match(registry, /p_action_id: actionId/);
  assert.match(registry, /finish_assistant_pending_action_for_current_user/);
  assert.match(registry, /registryArguments\(tool\.name, pending\.validated_arguments\)/);
  assert.doesNotMatch(registry, /executeConfirmedAssistantAction\([^)]*,\s*rawInput/);
  assert.match(registry, /finish\.error \|\| finish\.data !== \(result\.ok \? "executed" : "failed"\)/);
  assert.match(registry, /mutateAppointmentLifecycleForActiveTenant/);
  assert.match(registry, /createAppointmentForActiveTenant/);
  assert.match(registry, /getProfessionalAvailableSlots/);
});

test("entity resolution never chooses an ambiguous patient or professional", () => {
  assert.deepEqual(resolveUniqueEntity([]), { state: "NEEDS_INPUT", value: null });
  assert.deepEqual(resolveUniqueEntity([{ id: "one" }, { id: "two" }]), { state: "AMBIGUOUS", value: null });
  assert.deepEqual(resolveUniqueEntity([{ id: "one" }]), { state: "READY", value: { id: "one" } });
});

test("orchestration plans only unique, available appointment proposals", () => {
  const ready = planAppointmentProposal({ patientMatches: [{ id: "patient" }], professionalMatches: [{ id: "professional" }], availableSlots: [{ start: "09:00" }] });
  assert.deepEqual(ready, { state: "PROPOSAL_READY", patientId: "patient", professionalId: "professional" });
  assert.deepEqual(planAppointmentProposal({ patientMatches: [], professionalMatches: [{ id: "professional" }], availableSlots: [{}] }), { state: "NEEDS_INPUT" });
  assert.deepEqual(planAppointmentProposal({ patientMatches: [{ id: "patient" }, { id: "patient-2" }], professionalMatches: [{ id: "professional" }], availableSlots: [{}] }), { state: "AMBIGUOUS" });
  assert.deepEqual(planAppointmentProposal({ patientMatches: [{ id: "patient" }], professionalMatches: [], availableSlots: [{}] }), { state: "NEEDS_INPUT" });
  assert.deepEqual(planAppointmentProposal({ patientMatches: [{ id: "patient" }], professionalMatches: [{ id: "professional" }, { id: "professional-2" }], availableSlots: [{}] }), { state: "AMBIGUOUS" });
  assert.deepEqual(planAppointmentProposal({ patientMatches: [{ id: "patient" }], professionalMatches: [{ id: "professional" }], availableSlots: [] }), { state: "NO_AVAILABILITY" });
});

test("confirm, cancel, and reschedule only plan a unique appointment", () => {
  assert.deepEqual(planAppointmentMutation([{ id: "confirm" }]), { state: "PROPOSAL_READY", appointmentId: "confirm" });
  assert.deepEqual(planAppointmentMutation([{ id: "cancel" }]), { state: "PROPOSAL_READY", appointmentId: "cancel" });
  assert.deepEqual(planAppointmentMutation([{ id: "reschedule" }], [{ start: "11:00" }]), { state: "PROPOSAL_READY", appointmentId: "reschedule" });
  assert.deepEqual(planAppointmentMutation([{ id: "reschedule" }], []), { state: "NO_AVAILABILITY" });
  assert.deepEqual(planAppointmentMutation([]), { state: "NEEDS_INPUT" });
  assert.deepEqual(planAppointmentMutation([{ id: "one" }, { id: "two" }]), { state: "AMBIGUOUS" });
});

test("pending action storage is minimal and terminal actions are not retried", () => {
  const migration = readFileSync("supabase/migrations/0049_assistant_pending_actions.sql", "utf8");
  assert.match(registry, /patient_id.*professional_id.*local_date.*local_time.*duration_minutes/);
  assert.doesNotMatch(registry, /validated_arguments:.*title/);
  assert.match(migration, /key not in \('appointment_id','patient_id','professional_id','local_date','local_time','duration_minutes','expected_status'\)/);
  assert.match(registry, /if \(pending\.status !== "claimed"\) return assistantToolError\("confirmation_required"/);
  assert.match(migration, /v_action\.status <> 'claimed'/);
});
