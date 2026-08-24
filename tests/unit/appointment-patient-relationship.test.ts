import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const initialSchema = readFileSync("supabase/migrations/0001_initial_medcontrol_schema.sql", "utf8");
const appointmentIntegrity = readFileSync(
  "supabase/migrations/0028_appointment_assistant_integrity.sql",
  "utf8"
);
const medicalNoteIntegrity = readFileSync(
  "supabase/migrations/0027_medical_notes_tenant_integrity.sql",
  "utf8"
);

const appointmentSources = [
  ["Dashboard", readFileSync("lib/server/dashboard.ts", "utf8")],
  ["Citas", readFileSync("lib/server/appointments.ts", "utf8")],
  ["Asistente de agenda", readFileSync("lib/server/appointment-assistant.ts", "utf8")],
  ["acceso compartido", readFileSync("lib/supabase/data-access.ts", "utf8")]
] as const;

test("appointment embeds select the composite tenant-safe patient relationship", () => {
  for (const [surface, source] of appointmentSources) {
    assert.match(
      source,
      /patients!appointments_clinic_patient_fk(?:!inner)?\(/,
      `${surface} must disambiguate the appointment patient embed`
    );
  }

  const combined = appointmentSources.map(([, source]) => source).join("\n");
  assert.doesNotMatch(combined, /patients!inner\(/);
  assert.doesNotMatch(combined, /\.from\("appointments"\)[\s\S]{0,250}\.select\("[^"\n]*patients\(/);
});

test("dashboard, appointments and assistant preserve explicit tenant filters", () => {
  const tenantScopedSources = appointmentSources.slice(0, 3);

  for (const [surface, source] of tenantScopedSources) {
    assert.match(source, /\.from\("appointments"\)/, `${surface} must query appointments`);
    assert.match(source, /\.eq\("clinic_id", (?:tenant\.clinic\.id|clinicId)\)/);
    assert.match(source, /\.eq\("patients\.clinic_id", (?:tenant\.clinic\.id|clinicId)\)/);
  }
});

test("schema keeps both historical and composite patient constraints", () => {
  assert.match(
    initialSchema,
    /create table public\.appointments[\s\S]+patient_id uuid references public\.patients\(id\) on delete cascade not null/
  );
  assert.match(
    appointmentIntegrity,
    /add constraint appointments_clinic_patient_fk\s+foreign key \(clinic_id, patient_id\)\s+references public\.patients\(clinic_id, id\)/i
  );
  assert.match(
    medicalNoteIntegrity,
    /add constraint medical_notes_clinic_patient_fk\s+foreign key \(clinic_id, patient_id\)\s+references public\.patients\(clinic_id, id\)/i
  );
});
