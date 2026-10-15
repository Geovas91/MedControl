import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { canCreateAppointments } from "../../lib/appointments/create.ts";

const clinicId = "clinic-north";
const members = [
  { id: "member-1", clinic_id: clinicId, user_id: "doctor-1", full_name: "QA Doctor Uno", status: "active", is_professional: true },
  { id: "member-2", clinic_id: clinicId, user_id: "doctor-2", full_name: "QA Doctor Dos", status: "active", is_professional: true },
  { id: "inactive", clinic_id: clinicId, user_id: "inactive-user", status: "suspended", is_professional: true },
  { id: "non-professional", clinic_id: clinicId, user_id: "staff", status: "active", is_professional: false },
  { id: "foreign", clinic_id: "clinic-south", user_id: "foreign-user", status: "active", is_professional: true }
];

function load(role: string, lookupError = false) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const context = { state: "ready", user: { id: role === "doctor" ? "doctor-1" : "actor" }, tenant: {
    clinic: { id: clinicId, timezone: "America/Mexico_City", name: "QA" },
    membership: { id: role === "doctor" ? "member-1" : "actor-member", role }
  } };
  const client = {
    from(table: string) {
      // Direct membership queries reproduce the defect: the actor cannot list colleagues.
      if (table === "clinic_members") throw new Error("Use the existing authorized member-list RPC.");
      const result = { data: table === "patients" ? [{ id: "patient", full_name: "QA Patient", status: "active" }] : [], error: null };
      const query = { select: () => query, eq: () => query, order: async () => result, then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) { calls.push({ name, args }); return { data: [{ weekday: 1, start_time: "09:00:00", end_time: "17:00:00" }], error: null }; }
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => context },
    "@/lib/supabase/clinic-members": { listClinicMembersForClinic: async (requested: string) => {
      assert.equal(requested, clinicId);
      return lookupError ? { data: null, error: { code: "42501" } } : { data: members, error: null };
    } },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({}), canCreateWithEntitlements: () => true },
    "@/lib/appointments/create": { canCreateAppointments },
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: "2026-10-19" }) },
    "@/lib/logger": { logger: { error: () => {} } }
  };
  function module(path: string) {
    const exports: Record<string, (...args: unknown[]) => Promise<any>> = {};
    const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(output, { exports, require: (name: string) => mocks[name] ?? {} });
    return exports;
  }
  return { calls, appointments: module("lib/server/create-appointment.ts"), availability: module("lib/server/professional-availability.ts") };
}

for (const role of ["owner", "admin"]) {
  test(`${role} appointment options use authorized colleagues and preserve the appointment user FK`, async () => {
    const { appointments } = load(role);
    const result = await appointments.getAppointmentCreationOptions();
    assert.equal(result.state, "ready");
    assert.deepEqual(Array.from(result.data.doctors, (d: { id: string }) => d.id).sort(), ["doctor-1", "doctor-2"]);
    assert.equal(result.data.doctors.find((d: { id: string }) => d.id === "doctor-1").name, "QA Doctor Uno");
  });
  test(`${role} availability uses clinic-member IDs and never queries a foreign professional`, async () => {
    const { availability, calls } = load(role);
    const result = await availability.getProfessionalAvailability("member-2");
    assert.equal(result.state, "ready");
    assert.equal(result.data.selectedProfessionalId, "member-2");
    assert.equal(result.data.canEdit, true);
    assert.equal(result.data.clinic.timezone, "America/Mexico_City");
    assert.deepEqual(Array.from(result.data.professionals, (p: { id: string }) => p.id), ["member-1", "member-2"]);
    assert.equal(calls[0].args.p_clinic_member_id, "member-2");
    await availability.getProfessionalAvailability("foreign");
    assert.equal(calls[1].args.p_clinic_member_id, "member-1");
  });
}

test("doctor receives only their professional identity in appointment and availability selectors", async () => {
  const { appointments, availability, calls } = load("doctor");
  const options = await appointments.getAppointmentCreationOptions();
  assert.deepEqual(Array.from(options.data.doctors, (p: { id: string }) => p.id), ["doctor-1"]);
  const week = await availability.getProfessionalAvailability("member-2");
  assert.deepEqual(Array.from(week.data.professionals, (p: { id: string }) => p.id), ["member-1"]);
  assert.equal(calls[0].args.p_clinic_member_id, "member-1");
});

test("assistant keeps read-only availability and existing appointment scheduling access", async () => {
  const { appointments, availability } = load("assistant");
  assert.equal((await appointments.getAppointmentCreationOptions()).state, "ready");
  assert.equal((await availability.getProfessionalAvailability()).data.canEdit, false);
});

test("failed protected member lookup stays an error rather than a false empty professional list", async () => {
  const { appointments, availability, calls } = load("owner", true);
  assert.equal((await appointments.getAppointmentCreationOptions()).state, "error");
  assert.equal((await availability.getProfessionalAvailability()).state, "error");
  assert.equal(calls.length, 0);
});
