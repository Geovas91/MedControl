import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { QA_CLINICS, QA_USERS, STAGING_PROJECT_REF, parseProjectRef } from "./seed-rbac-demo-users.mjs";

const LOCAL_SUPABASE_URLS = new Set(["http://127.0.0.1:54321", "http://localhost:54321"]);
const QA_OWNER_BY_CLINIC = new Map(
  QA_USERS.filter((user) => user.role === "owner").map((user) => [user.clinicName, user])
);

function patient(clinicCode, doctorNumber, sequence) {
  const isUnassigned = doctorNumber === null;
  const label = isUnassigned ? `${clinicCode}-Unassigned` : `${clinicCode}-D${doctorNumber}-${String(sequence).padStart(2, "0")}`;
  const emailLabel = isUnassigned
    ? `${clinicCode.toLowerCase()}.unassigned`
    : `${clinicCode.toLowerCase()}.d${doctorNumber}.${String(sequence).padStart(2, "0")}`;

  return {
    clinicName: clinicCode === "N" ? "CliniControl QA Norte" : "CliniControl QA Sur",
    key: label,
    fullName: `QA Patient ${label}`,
    firstNames: "QA Patient",
    paternalSurname: label,
    email: `qa.patient.${emailLabel}@clinicontrol.mx`,
    phone: `+525500${clinicCode === "N" ? "1" : "2"}${doctorNumber ?? 0}${String(sequence ?? 0).padStart(2, "0")}`,
    dateOfBirth: `199${(doctorNumber ?? 0) + 1}-0${(sequence ?? 1)}-15`,
    professionalEmail: isUnassigned
      ? null
      : `qa.doctor${doctorNumber}.${clinicCode === "N" ? "norte" : "sur"}@clinicontrol.mx`
  };
}

export const PATIENT_SCOPE_PATIENTS = [
  ...[1, 2, 3].flatMap((doctorNumber) => [1, 2, 3].map((sequence) => patient("N", doctorNumber, sequence))),
  patient("N", null, null),
  ...[1, 2, 3].flatMap((doctorNumber) => [1, 2, 3].map((sequence) => patient("S", doctorNumber, sequence))),
  patient("S", null, null)
];

function fail(message) {
  throw new Error(message);
}

export function assertNoError(error, operation) {
  if (error) fail(`${operation} failed safely; no further changes were made.`);
}

function isEntrypoint() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}

function getSecretKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getQaPatientScopeRuntimeConfig({ local }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = getSecretKey();
  const demoPassword = process.env.QA_DEMO_PASSWORD;

  if (!supabaseUrl) fail("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!secretKey) fail("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  if (!demoPassword) fail("Missing QA_DEMO_PASSWORD.");

  const normalizedUrl = supabaseUrl.replace(/\/$/, "");
  if (local) {
    if (process.env.QA_PATIENT_SCOPE_ALLOW_LOCAL !== "1" || !LOCAL_SUPABASE_URLS.has(normalizedUrl)) {
      fail("Refusing local apply: set QA_PATIENT_SCOPE_ALLOW_LOCAL=1 and use a loopback Supabase URL.");
    }
  } else if (parseProjectRef(normalizedUrl) !== STAGING_PROJECT_REF) {
    fail("Refusing to run: the configured Supabase project is not the approved staging project.");
  }

  return { supabaseUrl: normalizedUrl, secretKey, demoPassword, local };
}

export function createAdmin(config) {
  return createClient(config.supabaseUrl, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function listQaUsers(admin) {
  const wanted = new Set(QA_USERS.map((user) => user.email));
  const users = new Map();
  let page = 1;
  while (users.size < wanted.size) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    assertNoError(error, "Listing QA users");
    for (const user of data.users) {
      if (user.email && wanted.has(user.email.toLowerCase())) users.set(user.email.toLowerCase(), user);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  if (users.size !== QA_USERS.length) fail("The approved QA users are incomplete; refusing patient dataset changes.");
  return users;
}

async function loadQaContext(admin) {
  const usersByEmail = await listQaUsers(admin);
  const { data: clinics, error: clinicError } = await admin
    .from("clinics")
    .select("id, name, tenant_type, timezone")
    .in("name", QA_CLINICS.map((clinic) => clinic.name));
  assertNoError(clinicError, "Reading QA clinics");
  if ((clinics ?? []).length !== QA_CLINICS.length) fail("The approved QA clinics are incomplete; refusing patient dataset changes.");

  const clinicByName = new Map((clinics ?? []).map((clinic) => [clinic.name, clinic]));
  for (const clinic of QA_CLINICS) {
    const current = clinicByName.get(clinic.name);
    if (!current || current.tenant_type !== "qa" || current.timezone !== "America/Mexico_City") {
      fail("An approved QA clinic has incompatible tenant metadata.");
    }
  }

  const { data: memberships, error: membershipError } = await admin
    .from("clinic_members")
    .select("id, clinic_id, user_id, role, status, is_professional")
    .in("user_id", [...usersByEmail.values()].map((user) => user.id));
  assertNoError(membershipError, "Reading QA memberships");

  const memberByEmail = new Map();
  for (const definition of QA_USERS) {
    const user = usersByEmail.get(definition.email);
    const clinic = clinicByName.get(definition.clinicName);
    const matching = (memberships ?? []).filter((member) => member.user_id === user.id && member.clinic_id === clinic.id);
    if (matching.length !== 1) fail("A required QA membership is missing or ambiguous.");
    const member = matching[0];
    if (member.role !== definition.role || member.status !== "active" || member.is_professional !== definition.isProfessional) {
      fail("A required QA membership has incompatible role or professional capability.");
    }
    memberByEmail.set(definition.email, member);
  }
  return { usersByEmail, clinicByName, memberByEmail };
}

function patientMatches(existing, definition, professionalUserId) {
  return existing &&
    existing.full_name === definition.fullName &&
    existing.first_names === definition.firstNames &&
    existing.paternal_surname === definition.paternalSurname &&
    existing.email?.toLowerCase() === definition.email &&
    existing.phone === definition.phone &&
    existing.date_of_birth === definition.dateOfBirth &&
    existing.status === "active" &&
    existing.archived_at === null &&
    existing.primary_doctor_id === professionalUserId;
}

async function loadExistingPatients(admin, context) {
  const patientsByKey = new Map();
  for (const clinic of QA_CLINICS) {
    const definitions = PATIENT_SCOPE_PATIENTS.filter((patientDefinition) => patientDefinition.clinicName === clinic.name);
    const { data, error } = await admin
      .from("patients")
      .select("id, clinic_id, full_name, first_names, paternal_surname, email, phone, date_of_birth, status, archived_at, primary_doctor_id")
      .eq("clinic_id", context.clinicByName.get(clinic.name).id)
      .in("email", definitions.map((definition) => definition.email));
    assertNoError(error, "Reading QA patients");
    for (const row of data ?? []) {
      const definition = definitions.find((item) => item.email === row.email?.toLowerCase());
      if (!definition || patientsByKey.has(definition.key)) fail("A QA patient match is ambiguous.");
      patientsByKey.set(definition.key, row);
    }
  }
  return patientsByKey;
}

async function createOwnerClient(config, owner) {
  const signInClient = createClient(config.supabaseUrl, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await signInClient.auth.signInWithPassword({ email: owner.email, password: config.demoPassword });
  assertNoError(error, "Authenticating QA owner");
  if (!data.session) fail("Authenticating QA owner returned no session.");
  return createClient(config.supabaseUrl, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
  });
}

async function createPatient(ownerClient, definition, clinicId, professionalUserId) {
  const { data, error } = await ownerClient.rpc("create_patient_with_record", {
    p_clinic_id: clinicId,
    p_first_names: definition.firstNames,
    p_paternal_surname: definition.paternalSurname,
    p_maternal_surname: null,
    p_date_of_birth: definition.dateOfBirth,
    p_sex: "unspecified",
    p_gender_identity: null,
    p_phone: definition.phone,
    p_email: definition.email,
    p_address: null,
    p_marital_status: null,
    p_occupation: null,
    p_education_level: null,
    p_status: "active",
    p_emergency_contact_name: null,
    p_emergency_contact_relationship: null,
    p_emergency_contact_phone: null,
    p_primary_doctor_id: professionalUserId
  });
  assertNoError(error, "Creating QA patient through the atomic patient RPC");
  const created = data?.[0];
  if (!created?.patient_id) fail("Creating QA patient returned no patient identifier.");
  return created.patient_id;
}

async function loadActiveAssignments(admin, clinicId, patientIds) {
  if (!patientIds.length) return [];
  const { data, error } = await admin
    .from("patient_professional_assignments")
    .select("clinic_id, patient_id, clinic_member_id, is_active, source")
    .eq("clinic_id", clinicId)
    .in("patient_id", patientIds)
    .eq("is_active", true);
  assertNoError(error, "Reading QA patient assignments");
  return data ?? [];
}

async function ensureAssignments(admin, context, config, patientsByKey) {
  const ownerClients = new Map();
  for (const clinic of QA_CLINICS) {
    const clinicId = context.clinicByName.get(clinic.name).id;
    const definitions = PATIENT_SCOPE_PATIENTS.filter((definition) => definition.clinicName === clinic.name);
    const activeAssignments = await loadActiveAssignments(admin, clinicId, definitions.map((definition) => patientsByKey.get(definition.key).id));
    const assignmentsByPatient = new Map();
    for (const assignment of activeAssignments) {
      const entries = assignmentsByPatient.get(assignment.patient_id) ?? [];
      entries.push(assignment);
      assignmentsByPatient.set(assignment.patient_id, entries);
    }

    for (const definition of definitions) {
      const patientRow = patientsByKey.get(definition.key);
      const existing = assignmentsByPatient.get(patientRow.id) ?? [];
      if (!definition.professionalEmail) {
        if (existing.length) fail("An unassigned QA patient already has an active professional assignment.");
        continue;
      }
      const expectedMember = context.memberByEmail.get(definition.professionalEmail);
      if (existing.length > 1 || (existing.length === 1 && (existing[0].clinic_member_id !== expectedMember.id || existing[0].source !== "manual"))) {
        fail("An existing QA patient assignment is incompatible with the approved scope dataset.");
      }
      if (existing.length === 1) continue;

      let ownerClient = ownerClients.get(clinic.name);
      if (!ownerClient) {
        ownerClient = await createOwnerClient(config, QA_OWNER_BY_CLINIC.get(clinic.name));
        ownerClients.set(clinic.name, ownerClient);
      }
      const { data, error } = await ownerClient.rpc("set_patient_professional_assignment_for_current_user", {
        p_clinic_id: clinicId,
        p_patient_id: patientRow.id,
        p_clinic_member_id: expectedMember.id,
        p_is_active: true
      });
      assertNoError(error, "Assigning QA patient through the authorized scope RPC");
      if (data !== true) fail("Assigning QA patient returned an unexpected result.");
    }
  }
}

export async function assertPatientScopeDataset(admin, context, patientsByKey) {
  if (patientsByKey.size !== PATIENT_SCOPE_PATIENTS.length) fail("Expected exactly 20 QA patients.");
  let assignmentCount = 0;
  for (const clinic of QA_CLINICS) {
    const clinicId = context.clinicByName.get(clinic.name).id;
    const definitions = PATIENT_SCOPE_PATIENTS.filter((definition) => definition.clinicName === clinic.name);
    const assignments = await loadActiveAssignments(admin, clinicId, definitions.map((definition) => patientsByKey.get(definition.key).id));
    const byPatient = new Map();
    for (const assignment of assignments) {
      const entries = byPatient.get(assignment.patient_id) ?? [];
      entries.push(assignment);
      byPatient.set(assignment.patient_id, entries);
      if (assignment.clinic_id !== clinicId || assignment.source !== "manual") fail("A QA assignment is cross-tenant or has an unexpected source.");
    }
    for (const definition of definitions) {
      const patientRow = patientsByKey.get(definition.key);
      const patientAssignments = byPatient.get(patientRow.id) ?? [];
      if (!definition.professionalEmail) {
        if (patientAssignments.length) fail("An unassigned QA patient unexpectedly has clinical scope.");
        continue;
      }
      const professional = context.memberByEmail.get(definition.professionalEmail);
      if (patientAssignments.length !== 1 || patientAssignments[0].clinic_member_id !== professional.id) {
        fail("A QA patient is not assigned to its expected professional.");
      }
      if (!professional.is_professional) fail("A QA assignment targets a non-professional member.");
      assignmentCount += 1;
    }
  }
  if (assignmentCount !== 18) fail("Expected exactly 18 active manual QA assignments.");
  return { patients: 20, assignments: assignmentCount };
}

export function printPlan() {
  console.log("[dry-run] QA Patient Scope dataset: 20 synthetic patients; NO READS, NO WRITES.");
  for (const definition of PATIENT_SCOPE_PATIENTS) {
    console.log(`[dry-run] ${definition.clinicName}: ${definition.fullName} -> ${definition.professionalEmail ?? "unassigned"}`);
  }
  console.log("[dry-run] Assigned rows use clinic_members.id, source=manual; no appointments are planned.");
}

export async function runSeed({ dryRun, local }) {
  if (dryRun) {
    printPlan();
    return;
  }
  const config = getQaPatientScopeRuntimeConfig({ local });
  const admin = createAdmin(config);
  const context = await loadQaContext(admin);
  const patientsByKey = await loadExistingPatients(admin, context);

  for (const definition of PATIENT_SCOPE_PATIENTS) {
    const clinic = context.clinicByName.get(definition.clinicName);
    const professionalUserId = definition.professionalEmail ? context.usersByEmail.get(definition.professionalEmail).id : null;
    const existing = patientsByKey.get(definition.key);
    if (existing) {
      if (!patientMatches(existing, definition, professionalUserId)) fail("An existing QA patient has incompatible data; refusing to overwrite it.");
      console.log(`[apply] reuse patient ${definition.key}`);
      continue;
    }
    const ownerClient = await createOwnerClient(config, QA_OWNER_BY_CLINIC.get(definition.clinicName));
    const patientId = await createPatient(ownerClient, definition, clinic.id, professionalUserId);
    const refreshed = await loadExistingPatients(admin, context);
    const created = refreshed.get(definition.key);
    if (!created || created.id !== patientId || !patientMatches(created, definition, professionalUserId)) {
      fail("Created QA patient could not be verified exactly.");
    }
    patientsByKey.set(definition.key, created);
    console.log(`[apply] create patient ${definition.key}`);
  }

  await ensureAssignments(admin, context, config, patientsByKey);
  const result = await assertPatientScopeDataset(admin, context, patientsByKey);
  console.log(`[apply] QA Patient Scope dataset completed: ${result.patients} patients, ${result.assignments} active manual assignments.`);
}

if (isEntrypoint()) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--dry-run", "--apply", "--local"].includes(arg))) {
    fail("Usage: node scripts/qa/seed-patient-scope-demo.mjs [--dry-run|--apply] [--local]");
  }
  if (args.has("--dry-run") && args.has("--apply")) fail("Use either --dry-run or --apply, not both.");
  if (args.has("--local") && !args.has("--apply")) fail("--local is only accepted with --apply.");
  runSeed({ dryRun: !args.has("--apply"), local: args.has("--local") }).catch((error) => {
    console.error(error instanceof Error ? error.message : "QA patient scope seed failed safely.");
    process.exitCode = 1;
  });
}
