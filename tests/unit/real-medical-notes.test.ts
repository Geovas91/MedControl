import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMedicalNotesListHref,
  getMedicalNotesPagination,
  medicalNotesPageSize,
  normalizeMedicalNotesListQuery
} from "../../lib/medical-notes/query.ts";
import { canCreateClinicalNote, canEditClinicalNote, canFinalizeClinicalNote, canViewClinicalRecord } from "../../lib/clinical-record/permissions.ts";

const listPage = readFileSync("app/dashboard/medical-notes/page.tsx", "utf8");
const newPage = readFileSync("app/dashboard/medical-notes/new/page.tsx", "utf8");
const clinicalNotes = readFileSync("lib/server/clinical-notes.ts", "utf8");
const createAction = readFileSync("app/dashboard/patients/[id]/notes/new/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/0027_medical_notes_tenant_integrity.sql", "utf8");

test("global medical notes use the real tenant-scoped paginated source", () => {
  assert.match(listPage, /getGlobalClinicalNotesForActiveTenant/);
  assert.doesNotMatch(listPage, /mockMedicalNotes|mock-data|demo/i);
  assert.match(clinicalNotes, /from\("medical_notes"\)[\s\S]+eq\("clinic_id", clinicId\)/);
  assert.match(clinicalNotes, /order\("created_at", \{ ascending: false \}\)[\s\S]+order\("id", \{ ascending: false \}\)[\s\S]+range\(pagination\.from, pagination\.to\)/);
  assert.doesNotMatch(clinicalNotes.match(/select\("id, patient_id[^"]+"\)/)?.[0] ?? "", /note_data|diagnosis|icd10_code/);
  assert.match(listPage, /clinical_impression/);
  assert.match(listPage, /Sin resumen clínico registrado/);
});

test("medical note pagination is clamped, stable and preserves filters", () => {
  assert.equal(medicalNotesPageSize, 10);
  assert.deepEqual(getMedicalNotesPagination(21, 99), { page: 3, pageCount: 3, from: 20, to: 29 });
  assert.deepEqual(normalizeMedicalNotesListQuery({ page: "-3", status: "invalid" }), { page: 1, status: null });
  assert.equal(buildMedicalNotesListHref({ page: 2, status: "draft" }, 3), "/dashboard/medical-notes?status=draft&page=3");
  assert.match(listPage, /Paginación de notas clínicas/);
  assert.match(listPage, /Esta clínica todavía no tiene notas clínicas/);
});

test("global creation selects real paginated patients and reuses the patient flow", () => {
  assert.match(newPage, /getClinicalNotePatientSelection/);
  assert.match(newPage, /normalizePatientListQuery/);
  assert.match(newPage, /buildPatientListHref\(query, data\.page [+-] 1, "\/dashboard\/medical-notes\/new"\)/);
  assert.match(newPage, /patientId=\$\{encodeURIComponent\(patient\.id\)\}/);
  assert.match(newPage, /getClinicalNoteFormOptions\(patientId\)/);
  assert.match(newPage, /createClinicalNoteAction\.bind/);
  assert.match(newPage, /ClinicalNoteForm/);
  assert.doesNotMatch(newPage, /mock-data|MedicalNoteForm|demo/i);
  assert.match(createAction, /createClinicalNoteForActiveTenant\(patientId, values\)/);
  assert.match(createAction, /revalidatePath\("\/dashboard\/medical-notes"\)/);
  assert.match(createAction, /patients\/\$\{result\.patientId\}\/notes\/\$\{result\.noteId\}\?note_created=1/);
});

test("global access keeps the existing clinical role model", () => {
  for (const role of ["owner", "admin", "doctor"] as const) {
    assert.equal(canViewClinicalRecord(role), true);
    assert.equal(canCreateClinicalNote(role), true);
    assert.equal(canFinalizeClinicalNote(role), true);
  }
  assert.equal(canViewClinicalRecord("assistant"), false);
  assert.equal(canCreateClinicalNote("assistant"), false);
  assert.equal(canFinalizeClinicalNote("assistant"), false);
  assert.equal(canEditClinicalNote({ role: "doctor", authorId: "doctor-a", currentUserId: "doctor-a", status: "draft" }), true);
  assert.equal(canEditClinicalNote({ role: "doctor", authorId: "doctor-b", currentUserId: "doctor-a", status: "draft" }), false);
  assert.equal(canEditClinicalNote({ role: "admin", authorId: "doctor-b", currentUserId: "admin-a", status: "draft" }), true);
  assert.equal(canEditClinicalNote({ role: "owner", authorId: "doctor-b", currentUserId: "owner-a", status: "finalized" }), false);
  assert.match(clinicalNotes, /!canViewClinicalRecord\(context\.tenant\.membership\.role\)/);
  assert.match(clinicalNotes, /!canCreateClinicalNote\(context\.tenant\.membership\.role\)/);
});

test("patient and note URL manipulation stays tenant and patient constrained", () => {
  assert.match(clinicalNotes, /select\("id, full_name"\)\.eq\("id", patientId\)\.eq\("clinic_id", context\.tenant\.clinic\.id\)/);
  assert.match(clinicalNotes, /select\("id, doctor_id, appointment_id[^"]+"\)\.eq\("id", noteId\)\.eq\("clinic_id", context\.tenant\.clinic\.id\)\.eq\("patient_id", patient\.id\)/);
  assert.match(newPage, /result\.state === "invalid_id" \|\| result\.state === "not_found"/);
  assert.match(newPage, /notFound\(\)/);
  assert.match(migration, /foreign key \(clinic_id, patient_id\)[\s\S]+references public\.patients\(clinic_id, id\)/i);
  assert.doesNotMatch(migration, /not valid|security definer/i);
  assert.match(migration, /revoke all on table public\.medical_notes from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.medical_notes to authenticated/i);
  assert.match(migration, /doctor_id = auth\.uid\(\)[\s\S]+has_clinic_role\(clinic_id, array\['owner', 'doctor', 'admin'\]\)[\s\S]+clinic_has_write_entitlement\(clinic_id\)/i);
  assert.match(migration, /drop index public\.medical_notes_clinic_id_idx[\s\S]+drop index public\.medical_notes_patient_id_idx/i);
  assert.match(migration, /medical_notes_clinic_created_id_idx[\s\S]+medical_notes_clinic_status_created_id_idx[\s\S]+medical_notes_patient_created_id_idx/i);
  assert.match(migration, /new\.patient_id is distinct from old\.patient_id/);
  assert.match(migration, /old\.doctor_id is distinct from auth\.uid\(\)[\s\S]+has_clinic_role\(old\.clinic_id, array\['owner', 'admin'\]\)/);
});

test("legacy visible template routes lead to the real template catalog", () => {
  const templatesPage = readFileSync("app/dashboard/medical-notes/templates/page.tsx", "utf8");
  const templateDetailPage = readFileSync("app/dashboard/medical-notes/templates/[templateId]/page.tsx", "utf8");
  assert.match(templatesPage, /redirect\("\/dashboard\/settings\/clinical-templates\?kind=note"\)/);
  assert.match(templateDetailPage, /redirect\(`\/dashboard\/settings\/clinical-templates\/\$\{encodeURIComponent\(templateId\)\}`\)/);
});
