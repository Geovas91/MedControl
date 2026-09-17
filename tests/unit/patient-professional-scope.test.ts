import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0050_patient_professional_scope.sql", "utf8");
const patients = readFileSync("lib/server/patients.ts", "utf8");
const clinicalRecord = readFileSync("lib/server/clinical-record.ts", "utf8");
const assistantTools = readFileSync("lib/assistant/tools/registry.ts", "utf8");

test("patient scope is clinic-member based and cannot assign an assistant", () => {
  assert.match(migration, /patient_professional_assignments/);
  assert.match(migration, /clinic_member_id uuid not null/);
  assert.match(migration, /member\.status = 'active' and member\.is_professional/);
  assert.match(migration, /foreign key \(clinic_id, clinic_member_id\)/);
  assert.match(migration, /where is_active/);
});

test("directory and clinical access remain deliberately separate", () => {
  assert.match(migration, /actor\.role in \('owner','admin','assistant'\) or public\.has_patient_professional_scope/);
  assert.match(migration, /Scoped professionals can read medical notes/);
  assert.match(migration, /Scoped professionals can read consents/);
  assert.match(clinicalRecord, /canAccessClinicalPatientForActiveTenant\(patientId\)/);
  assert.match(patients, /from\("patients"\)/);
});

test("assistant search continues through the server-scoped scheduling directory", () => {
  assert.match(assistantTools, /getPatientsForActiveTenant\(\{ search: input\.query/);
  assert.doesNotMatch(assistantTools, /include_all_patients/);
  assert.match(migration, /Active members can read permitted patient directory rows/);
});

test("active appointments establish provisional scope and cancellation removes appointment-only scope", () => {
  assert.match(migration, /appointments_sync_patient_professional_scope/);
  assert.match(migration, /new\.status <> 'cancelled'/);
  assert.match(migration, /assignment\.source='appointment'/);
  assert.match(migration, /not exists \(select 1 from public\.medical_notes/);
});
