import { DOCTORS, assertNoError, createAdmin, fail, getRuntimeConfig, isEntrypoint, loadContext, loadRules, signIn } from "./professional-availability-demo.mjs";

export function printCleanupDryRun({ local = false } = {}) {
  console.log(`[dry-run] target plan: ${local ? "LOCAL" : "STAGING"}; QA Professional Availability cleanup: NO READS, NO WRITES.`);
  for (const doctor of DOCTORS) console.log(`[dry-run] remove only exact ${doctor.clinicName} ${doctor.email} rules effective 2026-01-01, Monday-Friday ${doctor.intervals[0].start_time}-${doctor.intervals[0].end_time}`);
  console.log("[dry-run] Cleanup refuses incompatible rules and never touches appointments or exceptions.");
}

export async function runCleanup({ dryRun, local }) {
  if (dryRun) { printCleanupDryRun({ local }); return; }
  const config = getRuntimeConfig({ local });
  const admin = createAdmin(config);
  const context = await loadContext(admin);
  const owners = new Map();
  for (const doctor of DOCTORS) {
    const rows = await loadRules(admin, context, doctor);
    const target = rows.filter((row) => row.effective_from === "2026-01-01" && row.is_active && doctor.intervals.some((interval) => row.weekday === interval.weekday && String(row.start_time).slice(0, 5) === interval.start_time && String(row.end_time).slice(0, 5) === interval.end_time));
    if (rows.some((row) => !target.includes(row))) fail(`Refusing cleanup: incompatible availability exists for ${doctor.email}.`);
    if (!target.length) { console.log(`[apply] no QA availability found for ${doctor.email}`); continue; }
    const ownerEmail = doctor.region === "Norte" ? "qa.owner.norte@clinicontrol.mx" : "qa.owner.sur@clinicontrol.mx";
    let ownerClient = owners.get(ownerEmail);
    if (!ownerClient) { ownerClient = await signIn(config, ownerEmail); owners.set(ownerEmail, ownerClient); }
    for (const row of target) {
      const { error } = await ownerClient.from("professional_availability_rules").delete().eq("id", row.id);
      assertNoError(error, "Deleting exact QA availability rule");
    }
    console.log(`[apply] removed ${target.length} exact QA rules for ${doctor.email}`);
  }
  console.log("[apply] QA Professional Availability cleanup completed.");
}

if (isEntrypoint(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--dry-run", "--apply", "--local"].includes(arg)) || (args.has("--dry-run") && args.has("--apply"))) fail("Usage: node scripts/qa/cleanup-professional-availability-demo.mjs [--dry-run|--apply] [--local]");
  runCleanup({ dryRun: !args.has("--apply"), local: args.has("--local") }).catch((error) => { console.error(error instanceof Error ? error.message : "QA availability cleanup failed safely."); process.exitCode = 1; });
}
