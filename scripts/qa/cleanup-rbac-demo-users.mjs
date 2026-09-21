import { QA_CLINICS, QA_USERS, createAdmin, getDryRunConfig, getRuntimeConfig } from "./seed-rbac-demo-users.mjs";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function assertNoError(error, operation) {
  if (error) fail(`${operation} failed safely; no further changes were made.`);
}

async function listTargetUsers(admin) {
  const targetEmails = new Set(QA_USERS.map((user) => user.email));
  const usersByEmail = new Map();
  let page = 1;
  while (usersByEmail.size < targetEmails.size) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    assertNoError(error, "Listing QA users");
    for (const user of data.users) {
      if (user.email && targetEmails.has(user.email.toLowerCase())) usersByEmail.set(user.email.toLowerCase(), user);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return usersByEmail;
}

async function verifyScope(admin, usersByEmail) {
  const { data: clinics, error: clinicError } = await admin
    .from("clinics")
    .select("id, name, tenant_type")
    .in("name", QA_CLINICS.map((clinic) => clinic.name));
  assertNoError(clinicError, "Reading QA clinics");
  if ((clinics ?? []).some((clinic) => clinic.tenant_type !== "qa")) fail("Refusing cleanup: a matching clinic is not a QA tenant.");

  const userIds = [...usersByEmail.values()].map((user) => user.id);
  const clinicIds = new Set((clinics ?? []).map((clinic) => clinic.id));
  const [{ data: userMemberships, error: userMembershipError }, { data: clinicMemberships, error: clinicMembershipError }, { data: admins, error: adminError }] = await Promise.all([
    userIds.length
      ? admin.from("clinic_members").select("id, clinic_id, user_id").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    clinicIds.size
      ? admin.from("clinic_members").select("id, clinic_id, user_id").in("clinic_id", [...clinicIds])
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? admin.from("platform_admins").select("user_id").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  assertNoError(userMembershipError, "Reading QA user memberships");
  assertNoError(clinicMembershipError, "Reading QA clinic memberships");
  assertNoError(adminError, "Reading QA platform roles");
  if ((admins ?? []).length) fail("Refusing cleanup: a target QA user has a platform-administrator role.");
  const memberships = [...new Map([...(userMemberships ?? []), ...(clinicMemberships ?? [])].map((membership) => [membership.id, membership])).values()];
  const userIdsSet = new Set(userIds);
  if (memberships.some((membership) => !clinicIds.has(membership.clinic_id) || !userIdsSet.has(membership.user_id))) {
    fail("Refusing cleanup: a target QA user belongs to a non-QA clinic.");
  }
  return { clinics: clinics ?? [], memberships };
}

async function deleteClinicDependencies(admin, clinicId) {
  // Child records whose foreign keys use RESTRICT or whose audit rows may survive a clinic delete.
  const tables = [
    "support_rate_limit_counters", "support_interaction_metrics", "support_tickets", "audit_logs",
    "bot_logs", "appointment_invites", "calendar_integrations", "consent_signed_snapshots",
    "consent_documents", "consent_signatures", "consents", "medical_notes", "medical_note_templates",
    "payments", "review_invitations", "doctor_reviews", "doctor_public_profiles", "appointments",
    "patients", "clinic_member_invitations", "clinic_onboarding_acceptances", "clinic_subscriptions",
    "clinic_members", "paypal_billing_intents"
  ];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("clinic_id", clinicId);
    assertNoError(error, `Deleting QA ${table}`);
  }
}

export async function runCleanup({ dryRun, local = false }) {
  const target = local ? "LOCAL" : "STAGING";
  if (dryRun) {
    getDryRunConfig({ local });
    console.log(`[dry-run] target plan: ${target}; dataset: 2 clinics, 12 users, 12 memberships, 2 subscriptions; NO READS, NO WRITES.`);
    for (const clinic of QA_CLINICS) console.log(`[dry-run] delete QA clinic ${clinic.name} and scoped dependencies`);
    for (const definition of QA_USERS) console.log(`[dry-run] delete auth user ${definition.email}`);
    console.log("[dry-run] QA RBAC cleanup validated; demo seed user is outside the target.");
    return;
  }
  const admin = createAdmin(getRuntimeConfig({ local }));
  const usersByEmail = await listTargetUsers(admin);
  const scope = await verifyScope(admin, usersByEmail);
  for (const clinic of scope.clinics) {
    console.log(`[apply] delete QA clinic ${clinic.name} and scoped dependencies`);
    await deleteClinicDependencies(admin, clinic.id);
    const { error } = await admin.from("clinics").delete().eq("id", clinic.id);
    assertNoError(error, "Deleting QA clinic");
  }
  for (const definition of QA_USERS) {
    const user = usersByEmail.get(definition.email);
    console.log(`[apply] ${user ? "delete" : "skip missing"} auth user ${definition.email}`);
    if (!user) continue;
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    assertNoError(error, "Deleting QA auth user");
  }
  console.log("[apply] QA RBAC cleanup completed.");
}

const isEntrypoint = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntrypoint) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--dry-run", "--apply", "--local"].includes(arg))) fail("Usage: node scripts/qa/cleanup-rbac-demo-users.mjs [--dry-run|--apply] [--local]");
  if (args.has("--dry-run") && args.has("--apply")) fail("Use either --dry-run or --apply, not both.");
  runCleanup({ dryRun: !args.has("--apply"), local: args.has("--local") }).catch((error) => {
    console.error(error instanceof Error ? error.message : "QA cleanup failed safely.");
    process.exitCode = 1;
  });
}
