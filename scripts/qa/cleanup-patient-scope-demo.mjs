import { pathToFileURL } from "node:url";
import {
  PATIENT_SCOPE_PATIENTS,
  assertNoError,
  createAdmin,
  getQaPatientScopeRuntimeConfig
} from "./seed-patient-scope-demo.mjs";
import { QA_CLINICS } from "./seed-rbac-demo-users.mjs";

function fail(message) {
  throw new Error(message);
}

function isEntrypoint() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}

export function printCleanupPlan({ local = false } = {}) {
  console.log(`[dry-run] target plan: ${local ? "LOCAL" : "STAGING"}; QA Patient Scope cleanup: exact 20 synthetic patients and their manual assignments; NO READS, NO WRITES.`);
  for (const definition of PATIENT_SCOPE_PATIENTS) {
    console.log(`[dry-run] delete only exact patient ${definition.clinicName}: ${definition.fullName}`);
  }
  console.log("[dry-run] Cleanup refuses if any target patient has appointments or non-manual scope evidence.");
}

async function loadExactPatients(admin, clinicByName) {
  const patientsByClinic = new Map();
  for (const clinic of QA_CLINICS) {
    const definitions = PATIENT_SCOPE_PATIENTS.filter((definition) => definition.clinicName === clinic.name);
    const { data, error } = await admin
      .from("patients")
      .select("id, clinic_id, full_name, first_names, paternal_surname, email, phone, date_of_birth, status, archived_at")
      .eq("clinic_id", clinicByName.get(clinic.name).id)
      .in("email", definitions.map((definition) => definition.email));
    assertNoError(error, "Reading QA patients for cleanup");
    if ((data ?? []).length === 0) {
      patientsByClinic.set(clinic.name, []);
      continue;
    }
    if ((data ?? []).length !== definitions.length) fail("Refusing cleanup: the QA patient dataset is incomplete.");
    for (const row of data ?? []) {
      const definition = definitions.find((item) => item.email === row.email?.toLowerCase());
      if (!definition || row.full_name !== definition.fullName || row.first_names !== definition.firstNames || row.paternal_surname !== definition.paternalSurname || row.phone !== definition.phone || row.date_of_birth !== definition.dateOfBirth || row.status !== "active" || row.archived_at !== null) {
        fail("Refusing cleanup: an exact QA patient match is incompatible.");
      }
    }
    patientsByClinic.set(clinic.name, data ?? []);
  }
  return patientsByClinic;
}

async function assertNoUnexpectedEvidence(admin, clinicId, patientIds) {
  if (!patientIds.length) return;
  const [{ data: appointments, error: appointmentError }, { data: assignments, error: assignmentError }, ...evidenceResults] = await Promise.all([
    admin.from("appointments").select("id").eq("clinic_id", clinicId).in("patient_id", patientIds).limit(1),
    admin.from("patient_professional_assignments").select("patient_id, source").eq("clinic_id", clinicId).in("patient_id", patientIds),
    ...["medical_notes", "consents", "payments", "review_invitations", "appointment_invites", "doctor_reviews", "clinical_alerts", "vital_sign_measurements"].map((table) =>
      admin.from(table).select("id").eq("clinic_id", clinicId).in("patient_id", patientIds).limit(1)
    ),
    admin.from("patient_communication_preferences").select("patient_id").eq("clinic_id", clinicId).in("patient_id", patientIds).limit(1)
  ]);
  assertNoError(appointmentError, "Checking QA appointments before cleanup");
  assertNoError(assignmentError, "Checking QA assignments before cleanup");
  for (const result of evidenceResults) assertNoError(result.error, "Checking QA clinical evidence before cleanup");
  if ((appointments ?? []).length) fail("Refusing cleanup: a QA patient has appointments; no appointment data will be deleted.");
  if ((assignments ?? []).some((assignment) => assignment.source !== "manual")) {
    fail("Refusing cleanup: a QA patient has non-manual scope evidence.");
  }
  if (evidenceResults.some((result) => (result.data ?? []).length)) {
    fail("Refusing cleanup: a QA patient has non-baseline clinical or operational evidence.");
  }
}

async function loadGeneratedClinicalRows(admin, clinicId, patientIds) {
  const { data: records, error: recordError } = await admin
    .from("clinical_records")
    .select("id, patient_id")
    .eq("clinic_id", clinicId)
    .in("patient_id", patientIds);
  assertNoError(recordError, "Reading QA clinical records for cleanup");
  if ((records ?? []).length !== patientIds.length) fail("Refusing cleanup: a QA patient is missing or has duplicate clinical records.");
  const recordIds = records.map((record) => record.id);
  const { data: histories, error: historyError } = await admin
    .from("initial_clinical_histories")
    .select("id, clinical_record_id, patient_id")
    .eq("clinic_id", clinicId)
    .in("clinical_record_id", recordIds);
  assertNoError(historyError, "Reading QA clinical histories for cleanup");
  if ((histories ?? []).length !== recordIds.length) fail("Refusing cleanup: a QA clinical record is missing or has duplicate initial histories.");
  return { recordIds, historyIds: histories.map((history) => history.id) };
}

async function deleteGeneratedClinicalRows(admin, clinicId, patientIds) {
  const { recordIds, historyIds } = await loadGeneratedClinicalRows(admin, clinicId, patientIds);
  const childTables = [
    "clinical_history_identification",
    "family_medical_histories",
    "pathological_histories",
    "non_pathological_histories",
    "initial_clinical_assessments"
  ];
  for (const table of childTables) {
    const { error } = await admin.from(table).delete().eq("clinic_id", clinicId).in("history_id", historyIds);
    assertNoError(error, `Deleting QA ${table}`);
  }
  const eventIds = [...patientIds, ...recordIds, ...historyIds];
  const { error: eventError } = await admin.from("clinical_change_events").delete().eq("clinic_id", clinicId).in("entity_id", eventIds);
  assertNoError(eventError, "Deleting QA clinical change events");
  const { error: historyError } = await admin.from("initial_clinical_histories").delete().eq("clinic_id", clinicId).in("id", historyIds);
  assertNoError(historyError, "Deleting QA initial histories");
  const { error: recordError } = await admin.from("clinical_records").delete().eq("clinic_id", clinicId).in("id", recordIds);
  assertNoError(recordError, "Deleting QA clinical records");
  const { error: auditError } = await admin
    .from("audit_logs")
    .delete()
    .eq("clinic_id", clinicId)
    .in("entity_id", patientIds)
    .in("entity_type", ["patient", "patient_professional_assignment"]);
  assertNoError(auditError, "Deleting QA patient audit rows");
}

export async function runCleanup({ dryRun, local }) {
  if (dryRun) {
    printCleanupPlan({ local });
    return;
  }
  const config = getQaPatientScopeRuntimeConfig({ local });
  const admin = createAdmin(config);
  const { data: clinics, error: clinicError } = await admin
    .from("clinics")
    .select("id, name, tenant_type")
    .in("name", QA_CLINICS.map((clinic) => clinic.name));
  assertNoError(clinicError, "Reading QA clinics for cleanup");
  const clinicByName = new Map((clinics ?? []).map((clinic) => [clinic.name, clinic]));
  if (clinicByName.size !== QA_CLINICS.length || [...clinicByName.values()].some((clinic) => clinic.tenant_type !== "qa")) {
    fail("Refusing cleanup: approved QA clinics are missing or incompatible.");
  }
  const patientsByClinic = await loadExactPatients(admin, clinicByName);
  for (const clinic of QA_CLINICS) {
    const patients = patientsByClinic.get(clinic.name);
    if (!patients.length) {
      console.log(`[apply] no QA Patient Scope patients found for ${clinic.name}`);
      continue;
    }
    const clinicId = clinicByName.get(clinic.name).id;
    const patientIds = patients.map((patient) => patient.id);
    await assertNoUnexpectedEvidence(admin, clinicId, patientIds);
    const { error: assignmentError } = await admin
      .from("patient_professional_assignments")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("source", "manual")
      .in("patient_id", patientIds);
    assertNoError(assignmentError, "Deleting exact QA manual assignments");
    await deleteGeneratedClinicalRows(admin, clinicId, patientIds);
    const { error: patientError } = await admin
      .from("patients")
      .delete()
      .eq("clinic_id", clinicId)
      .in("id", patientIds);
    assertNoError(patientError, "Deleting exact QA patients");
    console.log(`[apply] delete ${patients.length} exact QA patients for ${clinic.name}`);
  }
  console.log("[apply] QA Patient Scope cleanup completed.");
}

if (isEntrypoint()) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--dry-run", "--apply", "--local"].includes(arg))) {
    fail("Usage: node scripts/qa/cleanup-patient-scope-demo.mjs [--dry-run|--apply] [--local]");
  }
  if (args.has("--dry-run") && args.has("--apply")) fail("Use either --dry-run or --apply, not both.");
  runCleanup({ dryRun: !args.has("--apply"), local: args.has("--local") }).catch((error) => {
    console.error(error instanceof Error ? error.message : "QA patient scope cleanup failed safely.");
    process.exitCode = 1;
  });
}
