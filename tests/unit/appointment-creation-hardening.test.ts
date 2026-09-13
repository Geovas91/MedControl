import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateAppointmentEnd,
  classifyAppointmentPersistenceError,
  combineClinicDateTime,
  validateAppointmentFormValues
} from "../../lib/appointments/create.ts";

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
