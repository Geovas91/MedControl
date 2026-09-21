import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { QA_CLINICS, QA_USERS, STAGING_PROJECT_REF, parseProjectRef } from "./seed-rbac-demo-users.mjs";

export const EFFECTIVE_FROM = "2026-01-01";
export const LOCAL_SUPABASE_URLS = new Set(["http://127.0.0.1:54321", "http://localhost:54321"]);
export const DOCTORS = [1, 2, 3].flatMap((doctorNumber) =>
  ["Norte", "Sur"].map((region) => ({
    doctorNumber,
    region,
    clinicName: `CliniControl QA ${region}`,
    email: `qa.doctor${doctorNumber}.${region === "Norte" ? "norte" : "sur"}@clinicontrol.mx`,
    intervals: [
      { weekday: 1, start_time: doctorNumber === 1 ? "09:00" : doctorNumber === 2 ? "10:00" : "08:00", end_time: doctorNumber === 1 ? "17:00" : doctorNumber === 2 ? "18:00" : "16:00" },
      { weekday: 2, start_time: doctorNumber === 1 ? "09:00" : doctorNumber === 2 ? "10:00" : "08:00", end_time: doctorNumber === 1 ? "17:00" : doctorNumber === 2 ? "18:00" : "16:00" },
      { weekday: 3, start_time: doctorNumber === 1 ? "09:00" : doctorNumber === 2 ? "10:00" : "08:00", end_time: doctorNumber === 1 ? "17:00" : doctorNumber === 2 ? "18:00" : "16:00" },
      { weekday: 4, start_time: doctorNumber === 1 ? "09:00" : doctorNumber === 2 ? "10:00" : "08:00", end_time: doctorNumber === 1 ? "17:00" : doctorNumber === 2 ? "18:00" : "16:00" },
      { weekday: 5, start_time: doctorNumber === 1 ? "09:00" : doctorNumber === 2 ? "10:00" : "08:00", end_time: doctorNumber === 1 ? "17:00" : doctorNumber === 2 ? "18:00" : "16:00" }
    ]
  }))
);

export function fail(message) { throw new Error(message); }
export function assertNoError(error, operation) { if (error) fail(`${operation} failed safely; no further changes were made.`); }
export function isEntrypoint(moduleUrl) { return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === moduleUrl; }

function secretKey() { return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY; }

export function getRuntimeConfig({ local, dryRun = false }) {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = (configuredUrl ?? `https://${STAGING_PROJECT_REF}.supabase.co`).replace(/\/$/, "");
  if (!local && parseProjectRef(supabaseUrl) !== STAGING_PROJECT_REF) fail("Refusing to run: the configured Supabase project is not the approved staging project.");
  if (dryRun) return { supabaseUrl, local: false, dryRun: true };
  const key = secretKey();
  const password = process.env.QA_DEMO_PASSWORD;
  if (!key) fail("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  if (!password) fail("Missing QA_DEMO_PASSWORD.");
  if (local && (process.env.QA_PROFESSIONAL_AVAILABILITY_ALLOW_LOCAL !== "1" || !LOCAL_SUPABASE_URLS.has(supabaseUrl))) {
    fail("Refusing local apply: set QA_PROFESSIONAL_AVAILABILITY_ALLOW_LOCAL=1 and use a loopback Supabase URL.");
  }
  if (!local && parseProjectRef(supabaseUrl) !== STAGING_PROJECT_REF) fail("Refusing to run outside the approved staging project.");
  return { supabaseUrl, key, password, local };
}

export function createAdmin(config) {
  return createClient(config.supabaseUrl, config.key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function listQaUsers(admin) {
  const wanted = new Set(QA_USERS.filter((user) => user.role === "doctor" || user.role === "owner").map((user) => user.email));
  const result = new Map();
  let page = 1;
  while (result.size < wanted.size) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    assertNoError(error, "Listing QA users");
    for (const user of data.users) if (user.email && wanted.has(user.email.toLowerCase())) result.set(user.email.toLowerCase(), user);
    if (data.users.length < 1000) break;
    page += 1;
  }
  if (result.size !== wanted.size) fail("Approved QA owner/doctor accounts are incomplete; refusing availability changes.");
  return result;
}

export async function loadContext(admin) {
  const usersByEmail = await listQaUsers(admin);
  const { data: clinics, error: clinicError } = await admin.from("clinics").select("id,name,tenant_type,timezone").in("name", QA_CLINICS.map((clinic) => clinic.name));
  assertNoError(clinicError, "Reading QA clinics");
  const clinicByName = new Map((clinics ?? []).map((clinic) => [clinic.name, clinic]));
  if (clinicByName.size !== QA_CLINICS.length || [...clinicByName.values()].some((clinic) => clinic.tenant_type !== "qa" || clinic.timezone !== "America/Mexico_City")) {
    fail("Approved QA clinics are missing or have incompatible tenant metadata.");
  }
  const { data: members, error: memberError } = await admin.from("clinic_members").select("id,clinic_id,user_id,role,status,is_professional").in("user_id", [...usersByEmail.values()].map((user) => user.id));
  assertNoError(memberError, "Reading QA memberships");
  const memberByEmail = new Map();
  for (const definition of QA_USERS.filter((user) => user.role === "doctor" || user.role === "owner")) {
    const user = usersByEmail.get(definition.email);
    const clinic = clinicByName.get(definition.clinicName);
    const matches = (members ?? []).filter((member) => member.user_id === user.id && member.clinic_id === clinic.id);
    if (matches.length !== 1) fail("A required QA owner/doctor membership is missing or ambiguous.");
    const member = matches[0];
    if (member.role !== definition.role || member.status !== "active" || (definition.role === "doctor" && member.is_professional !== true)) fail("A required QA professional membership is incompatible.");
    memberByEmail.set(definition.email, member);
  }
  return { usersByEmail, clinicByName, memberByEmail };
}

export function expectedRows(doctor) { return doctor.intervals.map((interval) => ({ ...interval, effective_from: EFFECTIVE_FROM, is_active: true })); }

export async function loadRules(admin, context, doctor) {
  const member = context.memberByEmail.get(doctor.email);
  const clinic = context.clinicByName.get(doctor.clinicName);
  const { data, error } = await admin.from("professional_availability_rules").select("id,clinic_id,clinic_member_id,weekday,start_time,end_time,effective_from,effective_until,is_active").eq("clinic_id", clinic.id).eq("clinic_member_id", member.id).order("weekday").order("start_time");
  assertNoError(error, "Reading QA availability rules");
  return data ?? [];
}

export function sameWindow(row, expected) {
  return row.weekday === expected.weekday && String(row.start_time).slice(0, 5) === expected.start_time && String(row.end_time).slice(0, 5) === expected.end_time && row.effective_from === expected.effective_from && row.is_active === true;
}

export function assertSafeRuleState(rows, doctor) {
  const wanted = expectedRows(doctor);
  const active = rows.filter((row) => row.is_active);
  if (active.length === wanted.length && active.every((row) => wanted.some((expected) => sameWindow(row, expected)))) return true;
  if (rows.length) fail(`Refusing to overwrite incompatible availability for ${doctor.email}.`);
  return false;
}

export async function signIn(config, email) {
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? config.key;
  const client = createClient(config.supabaseUrl, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: config.password });
  assertNoError(error, `Signing in QA user ${email}`);
  if (!data.session?.access_token) fail(`QA user ${email} did not return an authenticated session.`);
  return createClient(config.supabaseUrl, publicKey, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
}

export async function callSave(ownerClient, clinicId, memberId, intervals) {
  const { data, error } = await ownerClient.rpc("save_professional_availability_for_current_user", { p_clinic_id: clinicId, p_clinic_member_id: memberId, p_effective_from: EFFECTIVE_FROM, p_intervals: intervals });
  assertNoError(error, "Saving QA professional availability");
  if (data !== true) fail("Availability RPC did not confirm success.");
}

export function printDryRun() {
  console.log("[dry-run] QA Professional Availability: NO READS, NO WRITES.");
  for (const doctor of DOCTORS) console.log(`[dry-run] ${doctor.clinicName}: ${doctor.email} -> Monday-Friday ${doctor.intervals[0].start_time}-${doctor.intervals[0].end_time} effective ${EFFECTIVE_FROM}`);
  console.log("[dry-run] 6 doctors, 30 weekday rules, no weekends, no exceptions, no appointments.");
}
