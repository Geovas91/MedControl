import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute real services and validators against a mocked SDK. SQL 0060 tests
// separately exercise the actual authority and direct database bypass attempts.
const require = createRequire(import.meta.url);
const ids = { appointment: "60000000-0000-4000-8000-000000000301", patient: "60000000-0000-4000-8000-000000000201", actor: "60000000-0000-4000-8000-000000000005", other: "60000000-0000-4000-8000-000000000006", clinic: "60000000-0000-4000-8000-000000000100" };
const values = { patientId: ids.patient, doctorId: ids.actor, title: "QA updated", appointmentType: "QA", date: "2030-01-07", startTime: "10:00", duration: "30", status: "scheduled", location: "QA room", meetingUrl: "" };

type RpcError = { code: string; message?: string };
function harness(role = "owner", own = true) {
  const calls: { name: string; args: Record<string, any> }[] = [];
  const logs: unknown[] = [];
  const appointment = { id: ids.appointment, patient_id: ids.patient, doctor_id: own ? ids.actor : ids.other, title: "QA", appointment_type: "QA", location: "QA", starts_at: "2030-01-07T16:00:00.000Z", ends_at: "2030-01-07T16:30:00.000Z", status: "scheduled", updated_at: "2026-01-01T00:00:00Z" };
  const state = { rpcError: null as RpcError | null, empty: false, allowedPatient: true, writable: true };
  const query = (table: string) => {
    const row = table === "appointments" ? appointment : { id: ids.patient, profile_id: ids.other };
    const q: any = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: row, error: null }), then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [row], error: null }).then(resolve),
      update: () => { throw Error("Direct UPDATE bypass is forbidden"); }, insert: () => { throw Error("Direct INSERT bypass is forbidden"); }, delete: () => { throw Error("Direct DELETE bypass is forbidden"); } };
    return q;
  };
  const client = { from: query, rpc: async (name: string, args: Record<string, any>) => {
    calls.push({ name, args });
    const row = name === "update_appointment_metadata_for_current_user" ? { appointment_id: ids.appointment, patient_id: ids.patient, updated_at: "2026-01-02T00:00:00Z", changed: true }
      : { appointment_id: ids.appointment, ...appointment, status: args.p_operation === "restore" ? "scheduled" : args.p_operation, updated_at: "2026-01-02T00:00:00Z", changed: true };
    return { data: state.empty ? [] : [row], error: state.rpcError };
  } };
  const mocks: Record<string, any> = {
    "server-only": {},
    "@/lib/logger": { logger: { error: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => logs.push(args) } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: ids.actor }, tenant: { clinic: { id: ids.clinic, timezone: "America/Mexico_City" }, membership: { role, is_professional: role !== "assistant" } } }) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/server/patient-access": { canAccessClinicalPatientForActiveTenant: async () => ({ state: "ready", allowed: state.allowedPatient }) },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({ state: "ready" }), canCreateWithEntitlements: () => state.writable },
    "@/lib/email/provider": {}, "@/lib/email/resend-provider": {}, "@/lib/email/templates/review-invitation": {}, "@/lib/supabase/config": {}
  };
  const cache = new Map<string, Record<string, any>>();
  function load(file: string): Record<string, any> {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute)!;
    const exports: Record<string, any> = {}; cache.set(absolute, exports);
    const source = ts.transpileModule(readFileSync(absolute, "utf8").replaceAll("import.meta.url", '"qa:test"'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, FormData, URL, require: (name: string) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
      if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), name.endsWith(".ts") ? name : name + ".ts"));
      return require(name);
    } });
    return exports;
  }
  return { load, calls, logs, state, appointment, mocks };
}

for (const role of ["owner", "admin", "doctor"]) test(`metadata edit for ${role} uses only the bounded canonical RPC`, async () => {
  const h = harness(role);
  const result = await h.load("lib/server/update-appointment.ts").updateAppointmentForActiveTenant(ids.appointment, values);
  assert.equal(result.state, "success"); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, "update_appointment_metadata_for_current_user");
  assert.deepEqual(Object.keys(h.calls[0].args).sort(), ["p_clinic_id", "p_appointment_id", "p_title", "p_appointment_type", "p_location", "p_expected_updated_at"].sort());
  assert.equal(h.calls[0].args.p_clinic_id, ids.clinic); assert.equal(h.calls[0].args.p_expected_updated_at, h.appointment.updated_at);
  assert.equal(result.appointmentVersion, "2026-01-02T00:00:00Z");
});

for (const [role, own] of [["assistant", true], ["doctor", false]] as const) test(`metadata edit denies ${role}/own=${own} before mutation`, async () => {
  const h = harness(role, own); const service = h.load("lib/server/update-appointment.ts");
  assert.equal((await service.updateAppointmentForActiveTenant(ids.appointment, values)).state, "forbidden");
  assert.equal((await service.getAppointmentEditForActiveTenant(ids.appointment)).state, "forbidden");
  assert.equal(h.calls.length, 0);
});

test("metadata edit preserves the patient and scheduling-workflow contracts", async () => {
  const h = harness(); const service = h.load("lib/server/update-appointment.ts");
  assert.equal((await service.updateAppointmentForActiveTenant(ids.appointment, { ...values, patientId: ids.other })).state, "validation_error");
  for (const changed of [{ doctorId: ids.other }, { startTime: "11:00" }, { duration: "60" }]) assert.equal((await service.updateAppointmentForActiveTenant(ids.appointment, { ...values, ...changed })).state, "reschedule_required");
  assert.equal(h.calls.length, 0);
});

for (const [error, expected] of [[{ code: "42501" }, "forbidden"], [{ code: "P0002" }, "not_found"], [{ code: "40001" }, "error"]] as const) test(`metadata RPC ${error.code} never produces false success`, async () => {
  const h = harness(); h.state.rpcError = error;
  assert.equal((await h.load("lib/server/update-appointment.ts").updateAppointmentForActiveTenant(ids.appointment, values)).state, expected);
});

for (const [target, from] of [["waiting", "scheduled"], ["completed", "waiting"], ["scheduled", "cancelled"], ["confirmed", "scheduled"], ["cancelled", "scheduled"]]) test(`status ${target} crosses canonical lifecycle with CAS`, async () => {
  const h = harness(); h.appointment.status = from;
  h.appointment.starts_at = new Date().toISOString(); h.appointment.ends_at = new Date(Date.now() + 1800000).toISOString();
  const result = await h.load("lib/server/update-appointment-status.ts").updateAppointmentStatusForActiveTenant(ids.appointment, { targetStatus: target, expectedCurrentStatus: from });
  assert.equal(result.state, "success"); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, "mutate_appointment_lifecycle_for_current_user");
  assert.equal(result.appointmentVersion, "2026-01-02T00:00:00Z");
  assert.equal(h.calls[0].args.p_operation, target === "scheduled" ? "restore" : target === "confirmed" ? "confirm" : target === "cancelled" ? "cancel" : target);
  assert.equal(h.calls[0].args.p_expected_status, from);
  assert.equal(h.calls[0].args.p_clinic_id, ids.clinic);
});

for (const [role, own, target] of [["doctor", false, "completed"], ["doctor", false, "waiting"], ["assistant", true, "completed"], ["assistant", true, "waiting"], ["doctor", true, "scheduled"], ["assistant", true, "scheduled"]] as const) test(`status denies ${role}/own=${own}/${target}`, async () => {
  const h = harness(role, own); h.appointment.status = target === "scheduled" ? "cancelled" : "scheduled";
  assert.equal((await h.load("lib/server/update-appointment-status.ts").updateAppointmentStatusForActiveTenant(ids.appointment, { targetStatus: target, expectedCurrentStatus: h.appointment.status })).state, "forbidden");
  assert.equal(h.calls.length, 0);
});

for (const [error, expected] of [[{ code: "42501" }, "forbidden"], [{ code: "23P01" }, "conflict"], [{ code: "40001" }, "stale_state"], [{ code: "22023" }, "invalid_transition"], [{ code: "P0001", message: "appointment_too_early" }, "too_early"], [{ code: "22023", message: "appointment_terminal_state" }, "terminal_state"], [{ code: "P0002" }, "not_found"], [{ code: "XX000", message: "private raw database error" }, "error"]] as const) test(`lifecycle preserves ${expected} without leaking error text`, async () => {
  const h = harness(); h.state.rpcError = error;
  const result = await h.load("lib/server/appointment-lifecycle.ts").mutateAppointmentLifecycleForActiveTenant({ appointmentId: ids.appointment, operation: "waiting", expectedStatus: "scheduled" });
  assert.equal(result.state, expected); assert.doesNotMatch(JSON.stringify(h.logs), /private raw database error|appointment_too_early|appointment_terminal_state/);
});

test("empty metadata and lifecycle responses are failures", async () => {
  const h = harness(); h.state.empty = true;
  assert.equal((await h.load("lib/server/update-appointment.ts").updateAppointmentForActiveTenant(ids.appointment, values)).state, "error");
  assert.equal((await h.load("lib/server/appointment-lifecycle.ts").mutateAppointmentLifecycleForActiveTenant({ appointmentId: ids.appointment, operation: "waiting" })).state, "error");
});

test("history service checks patient scope and write entitlement before invoking authority", async () => {
  const h = harness("doctor"); const service = h.load("lib/server/patient-clinical.ts");
  const form = new FormData(); form.set("status", "draft"); form.set("information_reliability", "unknown");
  h.state.allowedPatient = false; assert.equal((await service.saveHistoryForActiveTenant(ids.patient, form)).ok, false);
  h.state.allowedPatient = true; h.state.writable = false; assert.equal((await service.saveHistoryForActiveTenant(ids.patient, form)).ok, false);
  assert.equal(h.calls.length, 0); h.state.writable = true; h.state.rpcError = { code: "42501" };
  assert.equal((await service.saveHistoryForActiveTenant(ids.patient, form)).ok, false);
  assert.equal(h.calls[0].name, "save_initial_clinical_history"); assert.equal(h.calls[0].args.p_patient_id, ids.patient);
});

test("availability propagates SQL entitlement rejection without any direct table write", async () => {
  const h = harness(); h.state.rpcError = { code: "42501" };
  const result = await h.load("lib/server/professional-availability.ts").saveProfessionalAvailability({ professionalId: "member", effectiveFrom: "2030-01-01", week: { 1: [{ start: "09:00", end: "17:00" }] } });
  assert.equal(result.state, "error"); assert.equal(result.code, "42501");
  assert.equal(h.calls[0].name, "save_professional_availability_for_current_user"); assert.equal(h.calls[0].args.p_clinic_id, ids.clinic);
});

test("foreign or unauthorized review status has no fabricated result", async () => {
  const h = harness(); h.state.empty = true;
  const result = await h.load("lib/server/review-invitations.ts").getReviewInvitationStatus(ids.appointment, ids.clinic);
  assert.equal(result.data, null); assert.equal(result.error, null);
  assert.equal(h.calls[0].name, "get_review_invitation_status_for_current_user");
  assert.equal(h.calls[0].args.p_clinic_id, ids.clinic);
});

test("operator-only QA cleanup retains guards and deletes only the exact verified tenant rule", async () => {
  const h = harness();
  const row = { id: "synthetic-rule", clinic_id: "synthetic-clinic", clinic_member_id: "synthetic-member", weekday: 1, start_time: "09:00", end_time: "17:00", effective_from: "2026-01-01", is_active: true };
  let guardPasses = false, incompatible = false, deletes = 0;
  const filters: Record<string, unknown> = {};
  const q = { eq: (key: string, value: unknown) => { filters[key] = value; return q; }, then: (resolve: (result: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  h.mocks["./professional-availability-demo.mjs"] = {
    DOCTORS: [{ clinicName: "Synthetic QA", email: "qa@example.test", intervals: [{ weekday: 1, start_time: "09:00", end_time: "17:00" }] }],
    getRuntimeConfig: ({ local }: { local: boolean }) => { assert.equal(local, true); if (!guardPasses) throw Error("guard denied"); return {}; },
    createAdmin: () => ({ from: (table: string) => { assert.equal(table, "professional_availability_rules"); return { delete: () => { deletes++; return q; } }; } }),
    loadContext: async () => ({}), loadRules: async () => [incompatible ? { ...row, effective_from: "2025-01-01" } : row],
    assertNoError: (error: unknown) => assert.equal(error, null), fail: (message: string) => { throw Error(message); }, isEntrypoint: () => false,
    signIn: () => { throw Error("Authenticated direct-write cleanup is forbidden"); }
  };
  const cleanup = h.load("scripts/qa/cleanup-professional-availability-demo.mjs");
  await assert.rejects(cleanup.runCleanup({ dryRun: false, local: true }), /guard denied/);
  assert.equal(deletes, 0);
  guardPasses = true; incompatible = true;
  await assert.rejects(cleanup.runCleanup({ dryRun: false, local: true }), /incompatible availability/);
  assert.equal(deletes, 0);
  incompatible = false;
  await cleanup.runCleanup({ dryRun: false, local: true });
  assert.equal(deletes, 1);
  assert.deepEqual(filters, { id: row.id, clinic_id: row.clinic_id, clinic_member_id: row.clinic_member_id });
});
