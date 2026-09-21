import { DOCTORS, assertNoError, assertSafeRuleState, callSave, createAdmin, fail, getRuntimeConfig, isEntrypoint, loadContext, loadRules, printDryRun, signIn } from "./professional-availability-demo.mjs";

export async function runSeed({ dryRun, local }) {
  if (dryRun) { getRuntimeConfig({ local: false, dryRun: true }); printDryRun(); return; }
  const config = getRuntimeConfig({ local });
  const admin = createAdmin(config);
  const context = await loadContext(admin);
  const owners = new Map();
  for (const doctor of DOCTORS) {
    const rows = await loadRules(admin, context, doctor);
    const complete = assertSafeRuleState(rows, doctor);
    if (complete) { console.log(`[apply] reuse availability ${doctor.email}`); continue; }
    const owner = QA_USERS_OWNER(context, doctor);
    let ownerClient = owners.get(owner.email);
    if (!ownerClient) { ownerClient = await signIn(config, owner.email); owners.set(owner.email, ownerClient); }
    const clinic = context.clinicByName.get(doctor.clinicName);
    const member = context.memberByEmail.get(doctor.email);
    await callSave(ownerClient, clinic.id, member.id, doctor.intervals);
    console.log(`[apply] create availability ${doctor.email}: 5 weekdays ${doctor.intervals[0].start_time}-${doctor.intervals[0].end_time}`);
  }
  console.log("[apply] QA Professional Availability dataset completed idempotently.");
}

function QA_USERS_OWNER(context, doctor) {
  const ownerEmail = doctor.region === "Norte" ? "qa.owner.norte@clinicontrol.mx" : "qa.owner.sur@clinicontrol.mx";
  if (!context.usersByEmail.has(ownerEmail)) fail(`Missing QA owner for ${doctor.clinicName}.`);
  return { email: ownerEmail };
}

if (isEntrypoint(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--dry-run", "--apply", "--local"].includes(arg)) || (args.has("--dry-run") && args.has("--apply")) || (args.has("--local") && !args.has("--apply"))) fail("Usage: node scripts/qa/seed-professional-availability-demo.mjs [--dry-run|--apply] [--local]");
  runSeed({ dryRun: !args.has("--apply"), local: args.has("--local") }).catch((error) => { console.error(error instanceof Error ? error.message : "QA availability seed failed safely."); process.exitCode = 1; });
}
