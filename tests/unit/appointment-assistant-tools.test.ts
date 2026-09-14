import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assistantToolNames, toolSchemas } from "../../lib/assistant/tools/contracts.ts";

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
  assert.match(registry, /current\.data\.clinicId !== action\.context\.clinicId/);
  assert.match(registry, /current\.data\.role !== action\.context\.role/);
  assert.match(registry, /pendingActions\.has\(action\)/);
  assert.match(registry, /mutateAppointmentLifecycleForActiveTenant/);
  assert.match(registry, /createAppointmentForActiveTenant/);
  assert.match(registry, /getProfessionalAvailableSlots/);
});
