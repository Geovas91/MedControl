import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCreateClinicalNote, canViewClinicalRecord } from "../../lib/clinical-record/permissions.ts";

const migration = readFileSync(new URL("../../supabase/migrations/0048_professional_capability.sql", import.meta.url), "utf8");
const appointmentService = readFileSync(new URL("../../lib/server/create-appointment.ts", import.meta.url), "utf8");
const availabilityService = readFileSync(new URL("../../lib/server/professional-availability.ts", import.meta.url), "utf8");
const memberActions = readFileSync(new URL("../../app/dashboard/members/actions.ts", import.meta.url), "utf8");

test("professional capability is independent from the clinic role", () => {
  assert.equal(canViewClinicalRecord({ role: "owner", is_professional: true }), true);
  assert.equal(canViewClinicalRecord({ role: "owner", is_professional: false }), false);
  assert.equal(canViewClinicalRecord({ role: "admin", is_professional: true }), true);
  assert.equal(canViewClinicalRecord({ role: "admin", is_professional: false }), false);
  assert.equal(canCreateClinicalNote({ role: "doctor", is_professional: true }), true);
  assert.equal(canViewClinicalRecord({ role: "assistant", is_professional: false }), false);
});

test("0048 enforces professional invariants and keeps tenant-safe scheduling", () => {
  assert.match(migration, /add column is_professional boolean not null default false/);
  assert.match(migration, /where role in \('owner', 'doctor'\)/);
  assert.match(migration, /new\.role = 'doctor'[\s\S]+new\.is_professional := true/);
  assert.match(migration, /new\.role = 'assistant'[\s\S]+new\.is_professional := false/);
  assert.match(migration, /A member cannot change their own professional capability/);
  assert.match(migration, /member\.status = 'active' and member\.is_professional/);
  assert.match(migration, /v_role not in \('owner','doctor','admin','assistant'\)/);
  assert.match(migration, /create_appointment_for_current_user[\s\S]+member\.is_professional/);
});

test("appointment and availability selectors use the canonical capability rather than public profiles or roles", () => {
  assert.match(appointmentService, /from\("clinic_members"\)[\s\S]+eq\("is_professional", true\)/);
  assert.match(appointmentService, /eq\("user_id", input\.doctorId\)[\s\S]+eq\("is_professional", true\)/);
  assert.match(availabilityService, /eq\("is_professional", true\)/);
  assert.doesNotMatch(availabilityService, /\.in\("role", \["owner", "doctor"\]\)/);
});

test("capability removal is serialized, protects future care, and safely unpublishes the directory profile", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_clinic_id::text \|\| ':' \|\| v_target\.user_id::text, 0\)\)/);
  assert.match(migration, /appointment\.starts_at > now\(\)[\s\S]+appointment\.status in \('scheduled', 'confirmed', 'waiting'\)/);
  assert.match(migration, /raise exception 'professional_has_future_appointments' using errcode = 'P0001'/);
  assert.match(migration, /update public\.doctor_public_profiles[\s\S]+set is_published = false[\s\S]+clinic_member_id = v_target\.id/);
  assert.match(migration, /or profile_id = v_target\.user_id/);
  assert.match(migration, /public_profiles_unpublished/);
  assert.match(migration, /p_doctor_id is null then raise exception 'Doctor is unavailable\.'/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_clinic_id::text \|\| ':' \|\| p_doctor_id::text, 0\)\)[\s\S]+member\.is_professional/);
});

test("members action maps the future-appointment rejection to a safe Spanish message", () => {
  assert.match(memberActions, /error\?\.message === "professional_has_future_appointments"/);
  assert.match(memberActions, /No puedes retirar la capacidad profesional mientras este miembro tenga citas futuras activas/);
  assert.doesNotMatch(memberActions, /error\.details|error\.hint/);
});

