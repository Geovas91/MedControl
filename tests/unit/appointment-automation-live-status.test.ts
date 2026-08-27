import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT,
  APPOINTMENT_AUTOMATION_LIVE_POLL_INTERVAL_MS,
  buildAppointmentAutomationLiveStatus,
  canViewAppointmentAutomationLiveStatus,
  getAppointmentAutomationSchedulerLabel,
  parseAppointmentAutomationLiveStatus,
  sanitizeAppointmentAutomationCode
} from "../../lib/appointment-automation-live-status.ts";

const route = readFileSync("app/api/appointment-automations/live-status/route.ts", "utf8");
const service = readFileSync("lib/server/appointment-automation-live-status.ts", "utf8");
const client = readFileSync("components/bot/appointment-automation-live-status.tsx", "utf8");
const page = readFileSync("app/dashboard/bot/page.tsx", "utf8");

const now = new Date("2026-08-27T18:00:00.000Z");
const safeJob = {
  job_id: "a1000000-0000-4000-8000-000000000001",
  job_type: "reminder_email",
  job_status: "succeeded",
  scheduled_for: "2026-08-27T17:00:00.000Z",
  attempts: 1,
  max_attempts: 3,
  last_error_code: null,
  appointment_id: "a2000000-0000-4000-8000-000000000001"
};

test("live endpoint requires a session and exposes only generic failures with no-store", () => {
  assert.match(route, /state === "unauthenticated"[\s\S]+status: 401/);
  assert.match(route, /error: "authentication_required"/);
  assert.match(route, /error: "status_unavailable"[\s\S]+status: 500/);
  assert.match(route, /Cache-Control": "private, no-store, max-age=0"/);
  assert.doesNotMatch(route, /error\.message|details|hint/);
});

test("live service derives the tenant from the active session and preserves all current roles", () => {
  assert.match(service, /getActiveTenantContext\(\)/);
  assert.match(service, /const clinicId = context\.tenant\.clinic\.id/);
  assert.match(service, /p_clinic_id: clinicId/);
  assert.match(service, /p_limit: APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT/);
  assert.doesNotMatch(route, /clinic_id|searchParams|params/);
  assert.doesNotMatch(service, /createAdminClient|service_role/);
  for (const role of ["owner", "admin", "doctor", "assistant"]) {
    assert.equal(canViewAppointmentAutomationLiveStatus(role), true);
  }
  assert.equal(canViewAppointmentAutomationLiveStatus("unknown"), false);
  assert.equal(APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT, 10);
});

test("scheduler labels preserve configuration, recent OK and stale signal semantics", () => {
  assert.equal(getAppointmentAutomationSchedulerLabel({ cronConfigured: false, lastCompletedAt: now.toISOString(), status: "ok", now: now.getTime() }), "Configuración incompleta");
  assert.equal(getAppointmentAutomationSchedulerLabel({ cronConfigured: true, lastCompletedAt: "2026-08-27T17:56:00.000Z", status: "ok", now: now.getTime() }), "Scheduler OK");
  assert.equal(getAppointmentAutomationSchedulerLabel({ cronConfigured: true, lastCompletedAt: "2026-08-27T17:54:59.999Z", status: "ok", now: now.getTime() }), "Sin señal");
  assert.equal(getAppointmentAutomationSchedulerLabel({ cronConfigured: true, lastCompletedAt: null, status: null, now: now.getTime() }), "Sin señal");
});

test("live payload sanitizes jobs and cannot carry PHI, recipients or secrets", () => {
  const source = {
    ...safeJob,
    last_error_code: "Provider Error: patient@example.test",
    patient_id: "secret-patient",
    patient_name: "Fictitious Patient",
    email: "patient@example.test",
    message: "private message",
    token: "private-token",
    clinic_id: "private-clinic"
  };
  const result = buildAppointmentAutomationLiveStatus({
    scheduler: { last_started_at: now.toISOString(), last_completed_at: now.toISOString(), last_status: "ok" },
    jobs: [source],
    cronConfigured: true,
    now
  });
  assert.deepEqual(Object.keys(result.jobs[0]).sort(), ["appointmentId", "attempts", "id", "lastErrorCode", "maxAttempts", "scheduledFor", "status", "type"].sort());
  assert.equal(result.jobs[0].lastErrorCode, "operation_error");
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /patient@example|Fictitious Patient|private-token|private-clinic|private message/);
  assert.equal(parseAppointmentAutomationLiveStatus(result)?.jobs.length, 1);
});

test("last error codes are allowed only in the persisted safe-code format", () => {
  assert.equal(sanitizeAppointmentAutomationCode("rate_limited"), "rate_limited");
  assert.equal(sanitizeAppointmentAutomationCode("provider_error"), "provider_error");
  assert.equal(sanitizeAppointmentAutomationCode(null), null);
  assert.equal(sanitizeAppointmentAutomationCode("UPSTREAM email@example.test"), "operation_error");
  assert.equal(sanitizeAppointmentAutomationCode("x".repeat(65)), "operation_error");
});

test("client polls every 20 seconds, pauses hidden tabs and resumes visibly", () => {
  assert.equal(APPOINTMENT_AUTOMATION_LIVE_POLL_INTERVAL_MS, 20_000);
  assert.match(client, /setInterval\(refresh, APPOINTMENT_AUTOMATION_LIVE_POLL_INTERVAL_MS\)/);
  assert.match(client, /document\.visibilityState === "visible"/);
  assert.match(client, /document\.addEventListener\("visibilitychange"/);
  assert.match(client, /void refresh\(\);[\s\S]+startPolling\(\)/);
  assert.match(client, /stopPolling\(\)[\s\S]+abortRef\.current\?\.abort\(\)[\s\S]+removeEventListener/);
  assert.doesNotMatch(client, /router\.refresh|Realtime|WebSocket/);
});

test("client prevents concurrent requests and keeps the last valid snapshot after failures", () => {
  assert.match(client, /if \(inFlightRef\.current \|\| document\.visibilityState !== "visible"\) return/);
  assert.match(client, /inFlightRef\.current = true/);
  assert.match(client, /if \(!response\.ok\) return/);
  assert.match(client, /if \(nextStatus && mountedRef\.current\) setStatus\(nextStatus\)/);
  assert.match(client, /transient failure keeps the last valid operational snapshot/);
  assert.doesNotMatch(client, /setStatus\([^n][^e][^x][^t]/);
});

test("manual refresh remains small, accessible and does not block the server-rendered page", () => {
  assert.match(client, /Actualizando\.\.\./);
  assert.match(client, />\s*Actualizar\s*</);
  assert.match(client, /role="status" aria-live="polite"/);
  assert.match(page, /buildAppointmentAutomationLiveStatus/);
  assert.match(page, /initialStatus=\{initialAutomationLiveStatus\}/);
  assert.doesNotMatch(page, /router\.refresh/);
});

test("endpoint surface has no PHI, recipients, secrets or raw provider fields", () => {
  const combined = `${route}\n${service}\n${readFileSync("lib/appointment-automation-live-status.ts", "utf8")}`;
  assert.doesNotMatch(combined, /patient_id|patientName|recipient|message_body|token_hash|RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /appointmentId|clinicId/);
  assert.match(service, /Boolean\(process\.env\.APPOINTMENT_AUTOMATION_CRON_SECRET\)/);
  assert.doesNotMatch(client, /APPOINTMENT_AUTOMATION_CRON_SECRET|cronConfigured/);
});
