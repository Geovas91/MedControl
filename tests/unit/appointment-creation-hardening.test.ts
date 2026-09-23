import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  calculateAppointmentEnd,
  canCreateAppointments,
  classifyAppointmentPersistenceError,
  combineClinicDateTime,
  validateAppointmentFormValues
} from "../../lib/appointments/create.ts";
import { isCanonicalAppointmentUuid } from "../../lib/appointments/query.ts";
import { parseCreateAppointmentPendingArguments } from "../../lib/assistant/tools/contracts.ts";

const migration = readFileSync("supabase/migrations/0040_appointment_scheduling_hardening.sql", "utf8");
const server = readFileSync("lib/server/create-appointment.ts", "utf8");

const validValues = {
  patientId: "10000000-0000-4000-8000-000000000001",
  doctorId: "20000000-0000-4000-8000-000000000001",
  title: "Consulta",
  appointmentType: "General",
  date: "2026-09-15",
  startTime: "09:30",
  duration: "30",
  status: "scheduled",
  location: "Consultorio 1",
  meetingUrl: ""
};

test("new appointments can only start scheduled", () => {
  assert.equal(validateAppointmentFormValues(validValues).valid, true);
  const confirmed = validateAppointmentFormValues({ ...validValues, status: "confirmed" });
  assert.equal(confirmed.valid, false);
  assert.equal(confirmed.fieldErrors.status, "Selecciona un estado inicial válido.");
});

test("missing appointment data is rejected before persistence", () => {
  const result = validateAppointmentFormValues({
    ...validValues,
    patientId: "",
    doctorId: "",
    title: "",
    startTime: ""
  });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["doctorId", "patientId", "startTime", "title"]);
});

test("QA owner can confirm the staging-shaped proposal for another active professional", async () => {
  const clinicId = "30000000-0000-4000-8000-000000000001";
  const ownerUserId = "40000000-0000-4000-8000-000000000001";
  const doctorUserId = "50000000-0000-4000-8000-000000000001";
  const doctorMemberId = "60000000-0000-4000-8000-000000000001";
  const patientId = "70000000-0000-4000-8000-000000000001";
  const durablePayload = {
    patient_id: patientId,
    professional_clinic_member_id: doctorMemberId,
    local_date: "2026-09-24",
    local_time: "16:00",
    duration_minutes: 30
  };
  const parsed = parseCreateAppointmentPendingArguments(durablePayload);
  assert.ok(parsed);

  let protectedMemberLookups = 0;
  let appointmentWrites = 0;
  const doctor = { id: doctorMemberId, clinic_id: clinicId, user_id: doctorUserId, role: "doctor", status: "active", is_professional: true };
  const noRows = { data: null, error: null };
  const client = {
    from(table: string) {
      const query = {
        select: () => query, eq: () => query, neq: () => query, lt: () => query, gt: () => query, limit: () => query,
        maybeSingle: async () => table === "patients" ? { data: { id: patientId }, error: null } : noRows
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== "create_appointment_for_current_user") throw new Error(`Unexpected RPC: ${name}`);
      appointmentWrites++;
      assert.equal(args.p_clinic_id, clinicId);
      assert.equal(args.p_doctor_id, doctorUserId);
      return { data: [{ appointment_id: "80000000-0000-4000-8000-000000000001", appointment_updated_at: "2026-09-24T22:00:00Z" }], error: null };
    }
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/appointments/create": { calculateAppointmentEnd, canCreateAppointments, classifyAppointmentPersistenceError, combineClinicDateTime, validateAppointmentFormValues },
    "@/lib/appointments/query": { isCanonicalAppointmentUuid },
    "@/lib/calendar/invitation": { buildAppointmentCalendarOperation: () => ({ operationKey: "test-operation", appointmentVersion: "test-version" }) },
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: "2026-09-24" }) },
    "@/lib/logger": { logger: { error: () => {} } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: ownerUserId }, tenant: { clinic: { id: clinicId, timezone: "America/Mexico_City" }, membership: { role: "owner", is_professional: false } } }) },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({}), canCreateWithEntitlements: () => true },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/clinic-members": { listClinicMembersForClinic: async (requestedClinicId: string) => {
      protectedMemberLookups++;
      assert.equal(requestedClinicId, clinicId);
      return { data: [doctor], error: null };
    } }
  };
  const source = ts.transpileModule(server, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, require: (name: string) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unmocked dependency: ${name}`);
  } });
  const result = await exports.createAppointmentForActiveTenant({
    patientId: parsed.patientId, doctorId: doctorUserId, title: "Cita", appointmentType: "",
    date: parsed.date, startTime: parsed.startTime, duration: String(parsed.durationMinutes),
    status: "scheduled", location: "", meetingUrl: ""
  });
  assert.equal(result.state, "success");
  assert.equal(protectedMemberLookups, 1);
  assert.equal(appointmentWrites, 1);
});

test("Mexico City wall time is converted once and duration remains exact", () => {
  const result = combineClinicDateTime("2026-09-15", "09:30", "America/Mexico_City");
  assert.deepEqual(result, { state: "valid", iso: "2026-09-15T15:30:00.000Z" });
  assert.equal(calculateAppointmentEnd(result.iso, 30), "2026-09-15T16:00:00.000Z");
});

test("the final insert uses the guarded RPC and maps authoritative failures", () => {
  assert.equal(classifyAppointmentPersistenceError("23P01"), "conflict");
  assert.equal(classifyAppointmentPersistenceError("42501"), "forbidden");
  assert.equal(classifyAppointmentPersistenceError("22023"), "relation_invalid");
  assert.equal(classifyAppointmentPersistenceError("23503"), "relation_invalid");
  assert.equal(classifyAppointmentPersistenceError("57014"), "error");
  assert.match(server, /rpc\(\s*"create_appointment_for_current_user"/);
  assert.match(server, /persistenceError === "conflict"[\s\S]+state: "conflict"/);
  assert.match(server, /persistenceError === "forbidden"[\s\S]+state: "forbidden"/);
  assert.doesNotMatch(server, /\.from\("appointments"\)\s*\.insert/);
});

test("the guarded RPC preserves tenant authorization and serializes conflict checks", () => {
  assert.match(migration, /security definer[\s\S]+set search_path = public, pg_temp/i);
  assert.match(migration, /auth\.uid\(\)[\s\S]+has_clinic_role\(p_clinic_id, array\['owner', 'doctor', 'admin'\]\)/i);
  assert.match(migration, /clinic_has_write_entitlement\(p_clinic_id\)/i);
  assert.match(migration, /patients[\s\S]+patient\.clinic_id = p_clinic_id[\s\S]+clinic_members[\s\S]+member\.clinic_id = p_clinic_id/i);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]+appointment\.starts_at < p_ends_at[\s\S]+appointment\.ends_at > p_starts_at/i);
  assert.match(migration, /insert into public\.appointments[\s\S]+p_starts_at, p_ends_at, 'scheduled'/i);
  assert.match(migration, /revoke insert on table public\.appointments from authenticated/i);
});
