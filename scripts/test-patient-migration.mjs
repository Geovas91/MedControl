import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname,resolve } from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sql=readFileSync(resolve(root,"supabase/migrations/0019_patient_universal_clinical_record.sql"),"utf8");
const patientQuery=readFileSync(resolve(root,"lib/server/patients.ts"),"utf8");
const patientForm=readFileSync(resolve(root,"components/patients/create-patient-form.tsx"),"utf8");
const patientAction=readFileSync(resolve(root,"app/dashboard/patients/new/actions.ts"),"utf8");
for(const table of ["clinical_records","initial_clinical_histories","clinical_alerts","family_medical_histories","pathological_histories","non_pathological_histories","initial_clinical_assessments","vital_sign_measurements","clinical_change_events"]){
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,"i"),`${table} debe habilitar RLS`);
}
assert.match(sql,/clinical_records_one_active_per_patient_idx[\s\S]+where archived_at is null and status = 'active'/i);
assert.match(sql,/foreign key \(clinic_id, clinical_record_id\)[\s\S]+references public\.clinical_records\(clinic_id, id\)/i);
assert.match(sql,/create or replace function public\.create_patient_with_record[\s\S]+security definer set search_path = public, pg_temp/i);
assert.match(sql,/create or replace function public\.save_initial_clinical_history[\s\S]+security definer set search_path = public, pg_temp/i);
assert.match(sql,/bmi numeric\(5,2\) generated always as/i);
assert.doesNotMatch(sql,/alter table public\.payments|create table public\.payments/i,"La migración clínica no debe modificar payments");
assert.match(patientQuery,/internal_identifier\.ilike/,"La búsqueda debe incluir el identificador interno");
assert.match(patientForm,/value="complete_history"/);assert.match(patientForm,/value="later"/);
assert.match(patientAction,/tab=historia/);assert.match(patientAction,/tab=resumen/);
console.log("Estructura de migración clínica validada: RLS, tenancy compuesta, RPC seguras, expediente único e IMC generado.");
