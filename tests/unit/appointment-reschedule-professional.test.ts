import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const appointmentId = "60000000-0000-4000-8000-000000000301";
const doctorId = "60000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000105";
const clinicId = "60000000-0000-4000-8000-000000000100";
const otherId = "60000000-0000-4000-8000-000000000200";
const localDate = "2030-01-07";

const compiled = ts.transpileModule(
  readFileSync(new URL("../../lib/server/appointment-reschedule.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;

function harness({ role = "owner", actor = otherId, appointmentVisible = true, memberOverrides = {}, lookupFails = false } = {}) {
  const calls = { clinics: [] as string[], filters: [] as unknown[][], slots: [] as unknown[] };
  const appointment = { id: appointmentId, doctor_id: doctorId, starts_at: "2030-01-07T15:00:00Z", ends_at: "2030-01-07T15:30:00Z" };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/appointments/edit": { appointmentTimestampToLocalParts: () => ({ date: localDate, time: "09:00" }) },
    "@/lib/appointments/format": { calculateAppointmentDuration: () => 30 },
    "@/lib/appointments/create": { appointmentDurations: [30] },
    "@/lib/appointments/query": { isCanonicalAppointmentUuid: () => true },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({
      state: "ready", user: { id: actor },
      tenant: { clinic: { id: clinicId, timezone: "America/Mexico_City" }, membership: { role } }
    }) },
    "@/lib/supabase/server": { createClient: async () => ({
      from(table: string) {
        const query = {
          select: () => query,
          eq: (...filter: unknown[]) => { calls.filters.push(filter); return query; },
          maybeSingle: async () => ({ data: table === "appointments" && appointmentVisible ? appointment : null, error: null })
        };
        return query;
      }
    }) },
    "@/lib/supabase/clinic-members": { listClinicMembersForClinic: async (clinic: string) => {
      calls.clinics.push(clinic);
      return {
        data: [{ id: memberId, clinic_id: clinicId, user_id: doctorId, status: "active", is_professional: true, ...memberOverrides }],
        error: lookupFails ? { code: "42501" } : null
      };
    } },
    "@/lib/server/professional-slots": { getProfessionalAvailableSlots: async (input: unknown) => {
      calls.slots.push(input);
      return { state: "ready", data: [
        { start_at: "2030-01-07T16:00:00Z", local_start: "10:00" },
        { start_at: "2030-01-07T17:00:00Z", local_start: "11:00" }
      ] };
    } },
    "@/lib/logger": { logger: { error() {} } }
  };
  const exports = { getAppointmentRescheduleForActiveTenant: undefined as unknown as typeof import("../../lib/server/appointment-reschedule").getAppointmentRescheduleForActiveTenant };
  runInNewContext(compiled, { exports, require: (id: string) => {
    assert.ok(Object.hasOwn(mocks, id), id);
    return mocks[id];
  } });
  return { load: () => exports.getAppointmentRescheduleForActiveTenant(appointmentId, localDate), calls };
}

for (const [role, actor] of [["owner", otherId], ["admin", otherId], ["doctor", doctorId]] as const) {
  test(`${role} resolves an active professional through the existing tenant RPC`, async () => {
    const { load, calls } = harness({ role, actor });
    const result = await load();
    assert.equal(result.state, "ready");
    assert.deepEqual(calls.clinics, [clinicId]);
    assert.deepEqual(calls.filters, [["id", appointmentId], ["clinic_id", clinicId]]);
    assert.equal((calls.slots[0] as { clinicMemberId: string }).clinicMemberId, memberId);
    assert.deepEqual(Array.from(result.data!.slots, slot => slot.local_start), ["09:00", "10:00", "11:00"]);
  });
}

test("unreadable appointments and another doctor's appointments never resolve memberships", async () => {
  for (const [options, expected] of [[{ appointmentVisible: false }, "not_found"], [{ role: "doctor" }, "forbidden"]] as const) {
    const { load, calls } = harness(options);
    assert.equal((await load()).state, expected);
    assert.deepEqual(calls.clinics, []);
    assert.deepEqual(calls.slots, []);
  }
});

test("RPC failure and ineligible membership fail closed before slot lookup", async () => {
  for (const options of [
    { lookupFails: true }, { memberOverrides: { clinic_id: otherId } }, { memberOverrides: { status: "inactive" } },
    { memberOverrides: { is_professional: false } }, { memberOverrides: { user_id: otherId } }
  ]) {
    const { load, calls } = harness(options);
    assert.equal((await load()).state, "error");
    assert.deepEqual(calls.clinics, [clinicId]);
    assert.deepEqual(calls.slots, []);
  }
});
