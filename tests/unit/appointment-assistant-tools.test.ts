import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assistantToolNames, parseCreateAppointmentPendingArguments, serializeCreateAppointmentPendingArguments, toolSchemas } from "../../lib/assistant/tools/contracts.ts";
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
  assert.equal(toolSchemas.createAppointment.parse({ patientId: "not-an-id", professionalClinicMemberId: "20000000-0000-4000-8000-000000000001", date: "2026-09-15", startTime: "09:00", durationMinutes: 30, title: "Consulta" }), null);
  assert.equal(toolSchemas.availableSlots.parse({ professionalClinicMemberId: "20000000-0000-4000-8000-000000000001", date: "2026-09-15", durationMinutes: 17 }), null);
  assert.deepEqual(toolSchemas.lifecycle.parse({ appointmentId: "10000000-0000-4000-8000-000000000001", expectedStatus: "scheduled" }), { appointmentId: "10000000-0000-4000-8000-000000000001", expectedStatus: "scheduled" });
  assert.deepEqual(toolSchemas.searchAppointments.parse({ date: "2026-09-15", period: "upcoming", status: "confirmed" }), { patientId: null, professionalId: null, date: "2026-09-15", status: "confirmed", period: "upcoming" });
  assert.equal(toolSchemas.searchAppointments.parse({ period: "all" }), null);
});

test("create appointment proposals and confirmations share the same durable payload contract", () => {
  const canonical = {
    patientId: "10000000-0000-4000-8000-000000000001",
    professionalClinicMemberId: "20000000-0000-4000-8000-000000000001",
    date: "2026-09-24",
    startTime: "15:30",
    durationMinutes: 30
  };
  const persisted = serializeCreateAppointmentPendingArguments(canonical);
  assert.deepEqual(persisted, {
    patient_id: canonical.patientId,
    professional_clinic_member_id: canonical.professionalClinicMemberId,
    local_date: canonical.date,
    local_time: canonical.startTime,
    duration_minutes: canonical.durationMinutes
  });
  assert.deepEqual(parseCreateAppointmentPendingArguments(persisted), canonical);
  assert.equal(parseCreateAppointmentPendingArguments({ ...persisted, patient_id: undefined }), null);
  assert.equal(parseCreateAppointmentPendingArguments({ ...persisted, professional_clinic_member_id: "not-an-id" }), null);
});

test("mutation tools remain confirmation-gated and derive context server-side", () => {
  assert.match(registry, /if \(tool\.mutation\) return assistantToolError\("confirmation_required"/);
  assert.match(registry, /getActiveTenantContext\(\)/);
  assert.match(registry, /claim_assistant_pending_action_for_current_user/);
  assert.match(registry, /p_action_id: actionId/);
  assert.match(registry, /finish_assistant_pending_action_for_current_user/);
  assert.match(registry, /parseCreateAppointmentPendingArguments\(value\)/);
  assert.match(registry, /const executionInput = registryArguments\(tool\.name, pending\.validated_arguments\)/);
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
  const migration = readFileSync("supabase/migrations/0050_patient_professional_scope.sql", "utf8");
  const lifecycleMigration = readFileSync("supabase/migrations/0049_assistant_pending_actions.sql", "utf8");
  assert.match(registry, /serializeCreateAppointmentPendingArguments\(input as CreateAppointmentToolInput\)/);
  assert.match(registry, /parseCreateAppointmentPendingArguments\(value\)/);
  assert.doesNotMatch(registry, /validated_arguments:.*title/);
  assert.match(migration, /key not in \('appointment_id','patient_id','professional_clinic_member_id','local_date','local_time','duration_minutes','expected_status'\)/);
  assert.match(registry, /if \(pending\.status !== "claimed"\) return assistantToolError\("confirmation_required"/);
  assert.match(registry, /if \(tool\.name === "create_appointment" && !parseCreateAppointmentPendingArguments\(persisted\)\)/);
  assert.match(lifecycleMigration, /v_action\.status <> 'claimed'/);
});

test("availability uses clinic member identity and resolves user identity only for appointment writes", () => {
  assert.match(registry, /professional_clinic_member_id/);
  assert.match(registry, /list_clinic_members_for_current_user/);
  assert.match(registry, /candidate\.id === clinicMemberId/);
  assert.match(registry, /getProfessionalAvailableSlots\(\{ clinicMemberId: member\.id/);
  assert.match(registry, /doctorId: member\.user_id/);
  assert.match(registry, /validateCreateAppointmentCandidate/);
  assert.match(registry, /local_start === input\.startTime/);
});
