import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canViewClinicalRecord, canViewPatientAudit } from "../../lib/clinical-record/permissions.ts";
import { getPatientAuditActionLabel, getPatientAuditResourceHref, getPatientAuditResourceLabel } from "../../lib/patients/record-tabs.ts";

const patientPage = readFileSync(new URL("../../app/dashboard/patients/[id]/page.tsx", import.meta.url), "utf8");
const consultations = readFileSync(new URL("../../components/patients/patient-consultations-tab.tsx", import.meta.url), "utf8");
const documents = readFileSync(new URL("../../components/patients/patient-documents-tab.tsx", import.meta.url), "utf8");
const auditComponent = readFileSync(new URL("../../components/patients/patient-audit-tab.tsx", import.meta.url), "utf8");
const auditService = readFileSync(new URL("../../lib/server/patient-audit.ts", import.meta.url), "utf8");
const clinicalRecordService = readFileSync(new URL("../../lib/server/clinical-record.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/0026_patient_safe_audit_timeline.sql", import.meta.url), "utf8");

test("patient tab permissions keep clinical data narrow and audit at minimum privilege", () => {
  assert.equal(canViewClinicalRecord("owner"), true);
  assert.equal(canViewClinicalRecord("admin"), true);
  assert.equal(canViewClinicalRecord("doctor"), true);
  assert.equal(canViewClinicalRecord("assistant"), false);
  assert.equal(canViewPatientAudit("owner"), true);
  assert.equal(canViewPatientAudit("admin"), true);
  assert.equal(canViewPatientAudit("doctor"), false);
  assert.equal(canViewPatientAudit("assistant"), false);
  assert.match(patientPage, /key==='auditoria'\?"Requiere rol owner o admin"/);
});

test("Consultas keeps clinical notes and appointments as separate real resources", () => {
  assert.match(consultations, /Notas clínicas/);
  assert.match(consultations, /Historial de citas/);
  assert.match(consultations, /Una cita no implica que exista una consulta documentada/);
  assert.match(consultations, /clinical_impression/);
  assert.match(consultations, /\/notes\/\$\{note\.id\}/);
  assert.match(consultations, /\/dashboard\/appointments\/\$\{appointment\.id\}/);
  assert.match(consultations, /No hay consultas registradas/);
  assert.match(clinicalRecordService, /\.from\("medical_notes"\)[\s\S]+\.eq\("clinic_id", clinicId\)\.eq\("patient_id", patientId\)/);
  assert.match(clinicalRecordService, /\.from\("appointments"\)[\s\S]+\.eq\("clinic_id", clinicId\)\.eq\("patient_id", patientId\)/);
  assert.match(clinicalRecordService, /appointmentsPageCount[\s\S]+appointmentsQuery\.range/);
  assert.match(consultations, /Paginación del historial de citas/);
  assert.doesNotMatch(clinicalRecordService, /\.limit\(100\)/);
});

test("Documentos exposes only the persisted consent and PDF flow", () => {
  assert.match(documents, /CliniControl conserva actualmente consentimientos y sus PDF firmados/);
  assert.match(documents, /\/api\/consents\/\$\{consent\.id\}\/document/);
  assert.match(documents, /generateConsentDocumentAction/);
  assert.match(documents, /Reintentar PDF/);
  assert.match(documents, /No hay documentos clínicos registrados/);
  assert.match(documents, /Paginación de documentos clínicos/);
  assert.match(clinicalRecordService, /documentsPageCount[\s\S]+consentsQuery\.range/);
  assert.doesNotMatch(documents, /upload|archivo genérico|mock/i);
});

test("safe patient audit RPC is tenant, patient and owner-admin constrained", () => {
  assert.match(migration, /security definer[\s\S]+set search_path = public, pg_temp/);
  assert.match(migration, /has_clinic_role\(p_clinic_id, array\['owner', 'admin'\]\)/);
  assert.match(migration, /patient\.clinic_id = p_clinic_id[\s\S]+patient\.id = p_patient_id/);
  assert.match(migration, /consent\.clinic_id = p_clinic_id[\s\S]+consent\.patient_id = patient\.id/);
  assert.match(migration, /document\.clinic_id = p_clinic_id[\s\S]+document\.patient_id = patient\.id/);
  assert.match(migration, /resource\.resource_type = change\.entity_type[\s\S]+resource\.resource_id = change\.entity_id/);
  assert.match(migration, /\(event\.occurred_at, event\.event_id\) < \(p_before_occurred_at, p_before_event_id\)/);
  assert.match(migration, /revoke all on function[\s\S]+from public, anon/);
  assert.doesNotMatch(migration.match(/returns table \([\s\S]+?\n\)/)?.[0] ?? "", /metadata|previous_values|new_values|changed_fields|token|hash|signature|url/i);
});

test("audit presentation never consumes raw payloads or an admin client", () => {
  assert.match(auditService, /\.rpc\("list_patient_audit_timeline_for_current_user"/);
  assert.match(auditService, /p_clinic_id: context\.tenant\.clinic\.id/);
  assert.match(auditService, /p_patient_id: patientId/);
  assert.match(auditService, /p_limit: auditPageSize \+ 1/);
  assert.match(auditService, /rows\.slice\(0, auditPageSize\)/);
  assert.match(auditComponent, /Ver eventos más antiguos/);
  assert.doesNotMatch(auditService, /createAdminClient|metadata|previous_values|new_values|changed_fields/);
  assert.doesNotMatch(auditComponent, /token|hash|signature|metadata|payload|url privada/i);
  assert.equal(getPatientAuditActionLabel("consent_signed"), "Consentimiento firmado");
  assert.equal(getPatientAuditActionLabel("unknown_internal_action"), "Actividad registrada");
  assert.equal(getPatientAuditResourceLabel("vital_sign_measurements"), "Signos vitales");
  assert.equal(getPatientAuditResourceLabel("unknown_table"), "Expediente del paciente");
  assert.equal(getPatientAuditResourceHref({ patientId: "patient-id", resourceType: "consent_document", relatedConsentId: "consent-id" }), "/dashboard/patients/patient-id/consents/consent-id");
});

test("patient record tabs remove the visible placeholder and keep the universal record", () => {
  assert.doesNotMatch(patientPage, /Próximamente|Proximamente|coming soon/i);
  assert.match(consultations, /Ver expediente universal/);
  assert.match(patientPage, /PatientConsultationsTab/);
  assert.match(patientPage, /PatientDocumentsTab/);
  assert.match(patientPage, /PatientAuditTab/);
});
