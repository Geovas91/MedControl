import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCreateAppointments } from "../../lib/appointments/create.ts";
import { canManageAppointmentLifecycle, canManageAppointmentStatusTarget } from "../../lib/appointments/status.ts";
import { professionalSelection } from '../helpers/professional-selection.ts';

const migration = readFileSync(new URL("../../supabase/migrations/0047_rbac_alignment.sql", import.meta.url), "utf8");

test("assistant can create and perform only scheduling lifecycle actions", () => {
  assert.equal(canCreateAppointments("assistant"), true);
  assert.equal(canManageAppointmentLifecycle("assistant"), true);
  assert.equal(canManageAppointmentStatusTarget("assistant", "confirmed"), true);
  assert.equal(canManageAppointmentStatusTarget("assistant", "cancelled"), true);
  assert.equal(canManageAppointmentStatusTarget("assistant", "waiting"), false);
  assert.equal(canManageAppointmentStatusTarget("assistant", "completed"), false);
});

test("0047 keeps lifecycle tenant-scoped and doctor-owned while adding assistant", () => {
  assert.match(migration, /\('owner','doctor','admin','assistant'\)/);
  assert.match(migration, /\('owner','admin','doctor','assistant'\)/);
  assert.match(migration, /v_role='doctor' and v_appointment\.doctor_id is distinct from v_actor/);
  assert.match(migration, /is_professional_interval_available_internal/);
});

test("doctor availability is constrained to the authenticated user and uses their clinic-member slot identity", async () => {
  const { availability, calls } = professionalSelection('doctor');
  for (const requested of ['member-2', 'foreign', 'inactive', 'non-professional']) {
    const result = await availability.getProfessionalAvailability(requested);
    assert.equal(result.state, 'ready');
    assert.deepEqual(Array.from(result.data.professionals, (row: { id: string }) => row.id), ['member-1']);
    assert.equal(result.data.selectedProfessionalId, 'member-1');
  }
  assert.ok(calls.every(call => call.args.p_clinic_id === 'clinic-north' && call.args.p_clinic_member_id === 'member-1'));
});
