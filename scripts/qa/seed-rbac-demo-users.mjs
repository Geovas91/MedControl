import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export const STAGING_PROJECT_REF = "fnknctihnrryntkjqxeo";
export const QA_CLINICS = [
  { name: "CliniControl QA Norte", region: "Norte" },
  { name: "CliniControl QA Sur", region: "Sur" }
];

export const QA_USERS = [
  ["qa.owner.norte@clinicontrol.mx", "QA Owner Norte", "CliniControl QA Norte", "owner", false],
  ["qa.doctor1.norte@clinicontrol.mx", "QA Doctor 1 Norte", "CliniControl QA Norte", "doctor", true],
  ["qa.doctor2.norte@clinicontrol.mx", "QA Doctor 2 Norte", "CliniControl QA Norte", "doctor", true],
  ["qa.doctor3.norte@clinicontrol.mx", "QA Doctor 3 Norte", "CliniControl QA Norte", "doctor", true],
  ["qa.assistant1.norte@clinicontrol.mx", "QA Assistant 1 Norte", "CliniControl QA Norte", "assistant", false],
  ["qa.assistant2.norte@clinicontrol.mx", "QA Assistant 2 Norte", "CliniControl QA Norte", "assistant", false],
  ["qa.owner.sur@clinicontrol.mx", "QA Owner Sur", "CliniControl QA Sur", "owner", false],
  ["qa.doctor1.sur@clinicontrol.mx", "QA Doctor 1 Sur", "CliniControl QA Sur", "doctor", true],
  ["qa.doctor2.sur@clinicontrol.mx", "QA Doctor 2 Sur", "CliniControl QA Sur", "doctor", true],
  ["qa.doctor3.sur@clinicontrol.mx", "QA Doctor 3 Sur", "CliniControl QA Sur", "doctor", true],
  ["qa.assistant1.sur@clinicontrol.mx", "QA Assistant 1 Sur", "CliniControl QA Sur", "assistant", false],
  ["qa.assistant2.sur@clinicontrol.mx", "QA Assistant 2 Sur", "CliniControl QA Sur", "assistant", false]
].map(([email, fullName, clinicName, role, isProfessional]) => ({
  email,
  fullName,
  clinicName,
  role,
  isProfessional
}));

export function parseProjectRef(supabaseUrl) {
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL.");
  }

  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (url.protocol !== "https:" || !match) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use an HTTPS Supabase project URL.");
  }
  return match[1];
}

export function getRuntimeConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const demoPassword = process.env.QA_DEMO_PASSWORD;

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY.");
  if (!demoPassword) throw new Error("Missing QA_DEMO_PASSWORD.");
  if (parseProjectRef(supabaseUrl) !== STAGING_PROJECT_REF) {
    throw new Error("Refusing to run: the configured Supabase project is not the approved staging project.");
  }

  return { supabaseUrl, secretKey, demoPassword };
}

function getDryRunConfig() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = configuredUrl ?? `https://${STAGING_PROJECT_REF}.supabase.co`;
  if (parseProjectRef(supabaseUrl) !== STAGING_PROJECT_REF) {
    throw new Error("Refusing to plan: the configured Supabase project is not the approved staging project.");
  }
  return { supabaseUrl };
}

export function createAdmin(config) {
  return createClient(config.supabaseUrl, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function entrypoint() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}

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

async function loadExistingState(admin, usersByEmail) {
  const { data: clinics, error: clinicsError } = await admin
    .from("clinics")
    .select("id, name, tenant_type, timezone")
    .in("name", QA_CLINICS.map((clinic) => clinic.name));
  assertNoError(clinicsError, "Reading QA clinics");

  const existingUserIds = [...usersByEmail.values()].map((user) => user.id);
  const clinicIds = (clinics ?? []).map((clinic) => clinic.id);
  const [userMembersResult, clinicMembersResult, platformAdminsResult, subscriptionsResult, profilesResult] = await Promise.all([
    existingUserIds.length
      ? admin.from("clinic_members").select("id, clinic_id, user_id, role, status, is_professional").in("user_id", existingUserIds)
      : Promise.resolve({ data: [], error: null }),
    clinicIds.length
      ? admin.from("clinic_members").select("id, clinic_id, user_id, role, status, is_professional").in("clinic_id", clinicIds)
      : Promise.resolve({ data: [], error: null }),
    existingUserIds.length
      ? admin.from("platform_admins").select("user_id").in("user_id", existingUserIds)
      : Promise.resolve({ data: [], error: null }),
    clinicIds.length
      ? admin.from("clinic_subscriptions").select("clinic_id, plan_id, status, billing_provider").in("clinic_id", clinicIds)
      : Promise.resolve({ data: [], error: null }),
    existingUserIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", existingUserIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  assertNoError(userMembersResult.error, "Reading QA user memberships");
  assertNoError(clinicMembersResult.error, "Reading QA clinic memberships");
  assertNoError(platformAdminsResult.error, "Reading QA platform roles");
  assertNoError(subscriptionsResult.error, "Reading QA subscriptions");
  assertNoError(profilesResult.error, "Reading QA profiles");

  return {
    clinics: clinics ?? [],
    memberships: [...new Map([...(userMembersResult.data ?? []), ...(clinicMembersResult.data ?? [])].map((membership) => [membership.id, membership])).values()],
    profiles: profilesResult.data ?? [],
    platformAdminUserIds: new Set((platformAdminsResult.data ?? []).map((row) => row.user_id)),
    subscriptions: subscriptionsResult.data ?? []
  };
}

function validateExistingState(usersByEmail, state) {
  const clinicByName = new Map(state.clinics.map((clinic) => [clinic.name, clinic]));
  if (clinicByName.size !== state.clinics.length) fail("Conflicting duplicate QA clinic names were found.");
  if ([...clinicByName.values()].some((clinic) => clinic.tenant_type !== "qa" || clinic.timezone !== "America/Mexico_City")) {
    fail("An existing QA clinic has incompatible tenant metadata.");
  }

  const expectedByUserId = new Map();
  for (const definition of QA_USERS) {
    const user = usersByEmail.get(definition.email);
    if (user) expectedByUserId.set(user.id, definition);
  }
  for (const userId of state.platformAdminUserIds) {
    if (expectedByUserId.has(userId)) fail("A target QA account has a platform-administrator role.");
  }

  for (const membership of state.memberships) {
    const expected = expectedByUserId.get(membership.user_id);
    if (!expected) fail("An existing QA clinic has a membership outside the approved QA dataset.");
    const expectedClinic = clinicByName.get(expected.clinicName);
    if (!expectedClinic || membership.clinic_id !== expectedClinic.id) {
      fail("A target QA account already belongs to an incompatible clinic.");
    }
    if (membership.role !== expected.role || membership.status !== "active" || membership.is_professional !== expected.isProfessional) {
      fail("An existing QA membership has an incompatible role, status, or capability.");
    }
  }

  for (const profile of state.profiles) {
    const expected = expectedByUserId.get(profile.id);
    if (expected && ((profile.email && profile.email.toLowerCase() !== expected.email) || (profile.full_name && profile.full_name !== expected.fullName))) {
      fail("An existing QA profile has incompatible identity details.");
    }
  }

  for (const clinic of state.clinics) {
    const subscription = state.subscriptions.find((item) => item.clinic_id === clinic.id);
    if (subscription && (subscription.plan_id !== "plus" || subscription.status !== "active" || subscription.billing_provider !== "demo")) {
      fail("An existing QA clinic has an incompatible subscription.");
    }
  }
}

async function createOrReuseUsers(admin, config, usersByEmail, dryRun) {
  const resolved = new Map(usersByEmail);
  for (const definition of QA_USERS) {
    const existing = resolved.get(definition.email);
    if (existing) {
      console.log(`[${dryRun ? "dry-run" : "apply"}] reuse auth user ${definition.email}`);
      continue;
    }
    console.log(`[${dryRun ? "dry-run" : "apply"}] create auth user ${definition.email} (email confirmed)`);
    if (dryRun) {
      resolved.set(definition.email, {
        id: `dry-run:auth:${encodeURIComponent(definition.email)}`,
        email: definition.email,
        dryRunPlaceholder: true
      });
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: definition.email,
      password: config.demoPassword,
      email_confirm: true,
      user_metadata: { full_name: definition.fullName, qa_dataset: "rbac_demo" }
    });
    assertNoError(error, "Creating QA auth user");
    if (!data.user) fail("Creating QA auth user returned no user.");
    resolved.set(definition.email, data.user);
  }
  return resolved;
}

async function createOrReuseClinics(admin, state, dryRun) {
  const resolved = new Map(state.clinics.map((clinic) => [clinic.name, clinic]));
  for (const definition of QA_CLINICS) {
    const existing = resolved.get(definition.name);
    if (existing) {
      console.log(`[${dryRun ? "dry-run" : "apply"}] reuse clinic ${definition.name}`);
      continue;
    }
    console.log(`[${dryRun ? "dry-run" : "apply"}] create clinic ${definition.name} (tenant=qa, timezone=America/Mexico_City)`);
    if (dryRun) {
      resolved.set(definition.name, {
        id: `dry-run:clinic:${encodeURIComponent(definition.name)}`,
        name: definition.name,
        tenant_type: "qa",
        timezone: "America/Mexico_City",
        dryRunPlaceholder: true
      });
      continue;
    }
    const { data, error } = await admin
      .from("clinics")
      .insert({ name: definition.name, timezone: "America/Mexico_City", tenant_type: "qa", region: definition.region })
      .select("id, name, tenant_type, timezone")
      .single();
    assertNoError(error, "Creating QA clinic");
    resolved.set(definition.name, data);
  }
  return resolved;
}

async function ensureProfiles(admin, state, usersByEmail, dryRun) {
  const existingProfiles = new Map(state.profiles.map((profile) => [profile.id, profile]));
  for (const definition of QA_USERS) {
    const user = usersByEmail.get(definition.email);
    if (!user) fail("QA dataset could not resolve an auth user for profile provisioning.");
    const profile = existingProfiles.get(user.id);
    if (profile?.full_name === definition.fullName && profile.email?.toLowerCase() === definition.email) {
      console.log(`[${dryRun ? "dry-run" : "apply"}] reuse profile ${definition.email}`);
      continue;
    }
    console.log(`[${dryRun ? "dry-run" : "apply"}] create profile ${definition.email}`);
    if (dryRun) continue;
    const { error } = await admin
      .from("profiles")
      .upsert({ id: user.id, full_name: definition.fullName, email: definition.email }, { onConflict: "id" });
    assertNoError(error, "Creating QA profile");
  }
}

async function applyData(admin, state, usersByEmail, clinicsByName, dryRun) {
  for (const definition of QA_USERS) {
    const user = usersByEmail.get(definition.email);
    const clinic = clinicsByName.get(definition.clinicName);
    if (!user || !clinic) fail("QA dataset could not resolve its required user or clinic.");
    const existing = state.memberships.find((membership) => membership.user_id === user.id && membership.clinic_id === clinic.id);
    console.log(
      `[${dryRun ? "dry-run" : "apply"}] ${existing ? "reuse" : "create"} membership ${definition.email} ` +
        `role=${definition.role} is_professional=${definition.isProfessional} active_tenant=${definition.clinicName}`
    );
    if (dryRun || existing) continue;
    const { error } = await admin.from("clinic_members").insert({
      clinic_id: clinic.id,
      user_id: user.id,
      role: definition.role,
      status: "active",
      is_professional: definition.isProfessional
    });
    assertNoError(error, "Creating QA membership");
  }

  for (const clinic of clinicsByName.values()) {
    const existing = state.subscriptions.find((subscription) => subscription.clinic_id === clinic.id);
    console.log(
      `[${dryRun ? "dry-run" : "apply"}] ${existing ? "reuse" : "create"} subscription for ${clinic.name} ` +
        `plan=plus status=active provider=demo entitlement=up_to_5_active_professionals`
    );
    if (dryRun || existing) continue;
    const { error } = await admin.from("clinic_subscriptions").insert({
      clinic_id: clinic.id,
      plan_id: "plus",
      status: "active",
      billing_provider: "demo",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
    assertNoError(error, "Creating QA subscription");
  }
}

export async function runSeed({ dryRun }) {
  const config = dryRun ? getDryRunConfig() : getRuntimeConfig();
  const admin = dryRun ? null : createAdmin(config);
  const usersByEmail = dryRun ? new Map() : await listTargetUsers(admin);
  const state = dryRun
    ? { clinics: [], memberships: [], profiles: [], platformAdminUserIds: new Set(), subscriptions: [] }
    : await loadExistingState(admin, usersByEmail);
  validateExistingState(usersByEmail, state);
  const resolvedUsers = await createOrReuseUsers(admin, config, usersByEmail, dryRun);
  await ensureProfiles(admin, state, resolvedUsers, dryRun);
  const clinicsByName = await createOrReuseClinics(admin, state, dryRun);
  await applyData(admin, state, resolvedUsers, clinicsByName, dryRun);
  console.log(
    `[${dryRun ? "dry-run" : "apply"}] QA RBAC dataset ${dryRun ? "validated offline; NO READS, NO WRITES" : "completed"}.`
  );
}

if (entrypoint()) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== "--dry-run" && arg !== "--apply")) fail("Usage: node scripts/qa/seed-rbac-demo-users.mjs [--dry-run|--apply]");
  if (args.has("--dry-run") && args.has("--apply")) fail("Use either --dry-run or --apply, not both.");
  runSeed({ dryRun: !args.has("--apply") }).catch((error) => {
    console.error(error instanceof Error ? error.message : "QA seed failed safely.");
    process.exitCode = 1;
  });
}
