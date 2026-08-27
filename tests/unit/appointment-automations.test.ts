import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAutomationRetryDelayMs, isAuthorizedAutomationCron, sanitizeAutomationCounters, shouldRetryAutomationEmail } from "../../lib/appointment-automations.ts";

const migration = readFileSync("supabase/migrations/0031_appointment_automation_jobs.sql", "utf8");
const runner = readFileSync("lib/server/appointment-automation-runner.ts", "utf8");
const route = readFileSync("app/api/internal/appointment-automations/run/route.ts", "utf8");
const template = readFileSync("lib/email/templates/appointment-reminder.ts", "utf8");

test("cron authorization rejects absent, short and non-equal secrets", () => {
  const secret = "0123456789abcdefghijklmnop";
  assert.equal(isAuthorizedAutomationCron(secret, secret), true);
  assert.equal(isAuthorizedAutomationCron(null, secret), false);
  assert.equal(isAuthorizedAutomationCron("short", "short"), false);
  assert.equal(isAuthorizedAutomationCron(`${secret}x`, secret), false);
  assert.match(route, /await import\("@\/lib\/server\/appointment-automation-runner"\)/);
});

test("retry policy is bounded and delivery uncertainty is not retried", () => {
  assert.deepEqual([1, 2, 3, 99].map(getAutomationRetryDelayMs), [60_000, 300_000, 900_000, 900_000]);
  assert.equal(shouldRetryAutomationEmail("timeout"), false);
  assert.equal(shouldRetryAutomationEmail("rate_limited"), true);
  assert.equal(shouldRetryAutomationEmail("provider_error"), false);
  assert.equal(shouldRetryAutomationEmail("delivery_unknown"), false);
  assert.equal(shouldRetryAutomationEmail("misconfigured"), false);
});

test("public counters are non-negative integers only", () => {
  assert.deepEqual(sanitizeAutomationCounters({ claimed: 2, succeeded: -1, failed: Number.NaN }), {
    claimed: 2, succeeded: 0, skipped: 0, retryPending: 0, failed: 0
  });
});

test("0031 has persistent locking, tenant-safe dedupe, no client reads and quiet-hour scheduling", () => {
  assert.match(migration, /foreign key \(clinic_id, appointment_id\)[\s\S]+appointments\(clinic_id, id\)/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_expires_at/);
  assert.match(migration, /unique \(clinic_id, dedupe_key\)/i);
  assert.match(migration, /revoke all privileges on table public\.appointment_automation_jobs from public, anon, authenticated/i);
  assert.match(migration, /calculate_appointment_reminder_at[\s\S]+at time zone p_timezone/i);
  const table = migration.match(/create table public\.appointment_automation_jobs \(([\s\S]+?)\n\);/)?.[1] ?? "";
  assert.doesNotMatch(table, /\bpatient_id\b|\bpatient_email\b|\bmessage\b|\bpayload\b|\braw_token\b|\btoken_hash\b|\bnotes\b|\bdiagnosis\b/i);
});

test("review automation issues once and never retries after plaintext issuance", () => {
  assert.match(migration, /exists\(select 1 from public\.review_invitations where appointment_id = v_job\.appointment_id\)/i);
  assert.match(migration, /automation_job_id/);
  assert.match(runner, /Never retry or regenerate after issuance/);
  assert.match(runner, /review-automation-\$\{invitation\.invitation_id\}/);
});

test("reminder content is neutral and logs do not receive PHI", () => {
  assert.match(template, /información operativa de agenda/);
  assert.doesNotMatch(template, /diagnóstico|motivo|notas|patient|paciente/i);
  assert.doesNotMatch(runner, /logger\.(?:error|warn|info)\([^\n]+(?:patient_email|raw_token|reviewUrl|clinic_name|doctor_display_name)/i);
});
