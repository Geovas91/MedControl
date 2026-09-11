import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyAutomationContextLookup,
  classifyAutomationFinalization,
  confirmAutomationMutation,
  getReminderPreflightInvalidation,
  sanitizeAutomationCounters
} from "../../lib/appointment-automations.ts";

const runner = readFileSync("lib/server/appointment-automation-runner.ts", "utf8");
const migration = readFileSync("supabase/migrations/0037_appointment_automation_runner_hardening.sql", "utf8");

test("finish errors and false results cannot be confirmed as persisted", async () => {
  const finishError = await confirmAutomationMutation(async () => ({ data: true, error: { code: "PGRST000" } }));
  const finishFalse = await confirmAutomationMutation(async () => ({ data: false, error: null }));
  const finishThrows = await confirmAutomationMutation(async () => { throw new Error("database unavailable"); });
  const finishTrue = await confirmAutomationMutation(async () => ({ data: true, error: null }));
  assert.deepEqual([finishError, finishFalse, finishThrows, finishTrue], [false, false, false, true]);
  for (const confirmed of [finishError, finishFalse, finishThrows]) {
    const counters = sanitizeAutomationCounters({});
    counters[classifyAutomationFinalization("succeeded", confirmed, true)] += 1;
    assert.equal(counters.succeeded, 0);
    assert.equal(counters.uncertain, 1);
  }
  assert.equal(classifyAutomationFinalization("succeeded", finishTrue, true), "succeeded");
});

test("runner checks every persistence boundary before counting success", () => {
  assert.match(runner, /confirmAutomationMutation\(\(\) => client\.rpc/);
  assert.match(runner, /markAccepted[\s\S]+classifyAutomationFinalization\("succeeded", await finish/);
  assert.match(runner, /const reviewPersisted = await rpcConfirmed[\s\S]+if \(!reviewPersisted\)/);
  assert.match(runner, /counters\[outcome\] \+= 1/);
  assert.doesNotMatch(runner, /await finish\([^;]+;\s*return "succeeded"/);
});

test("twenty high-latency jobs remain safe because each delivery renews its own lease", () => {
  const jobs = 20;
  const providerLatencySeconds = 12;
  const leaseSeconds = 90;
  assert.equal(jobs * providerLatencySeconds, 240);
  assert.ok(jobs * providerLatencySeconds > leaseSeconds);
  assert.ok(providerLatencySeconds < leaseSeconds);
  assert.match(runner, /renew\(client, job, workerId\)[\s\S]+beginDelivery\(client, job, workerId\)[\s\S]+sendWithResend/);
});

test("fencing and delivery lifecycle prevent stale mutation and blind resend", () => {
  assert.match(migration, /lease_token = p_lease_token/g);
  assert.match(migration, /delivery_state = 'dispatching'/);
  assert.match(migration, /delivery_state = 'uncertain'[\s\S]+last_error_code = 'delivery_uncertain'/);
  assert.match(migration, /delivery_state = 'accepted'[\s\S]+delivery_state = 'persisted'/);
  assert.match(migration, /grant execute on function public\.renew_appointment_automation_job_lease[\s\S]+to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]+to (?:anon|authenticated)/i);
});

const reminderJob = {
  clinic_id: "clinic-a",
  appointment_id: "appointment-a",
  source_version: "2026-09-10T18:00:00.000Z"
};

const reminderContext = {
  clinic_id: "clinic-a",
  appointment_id: "appointment-a",
  appointment_status: "scheduled",
  starts_at: "2026-09-10T18:00:00+00:00",
  patient_email: "patient@example.test",
  doctor_display_name: "Doctor",
  valid_subscription: true,
  assistant_enabled: true,
  reminder_enabled: true
};

test("a retryable second context read does not become a permanent preflight skip", () => {
  let providerCalls = 0;
  const lookup = classifyAutomationContextLookup<typeof reminderContext>({ data: null, error: { code: "PGRST000" } });
  if (lookup.state === "ready" && !getReminderPreflightInvalidation(reminderJob, lookup.context, Date.parse("2026-09-10T17:00:00Z"))) {
    providerCalls += 1;
  }
  assert.deepEqual(lookup, { state: "retryable", code: "pgrst000" });
  assert.equal(providerCalls, 0);
});

test("equivalent timestamp representations and irrelevant metadata still dispatch once", () => {
  let providerCalls = 0;
  const lookup = classifyAutomationContextLookup<typeof reminderContext & { clinic_name: string }>({
    data: [{ ...reminderContext, clinic_name: "Renamed without delivery impact" }],
    error: null
  });
  if (lookup.state === "ready" && !getReminderPreflightInvalidation(reminderJob, lookup.context, Date.parse("2026-09-10T17:00:00Z"))) {
    providerCalls += 1;
  }
  assert.equal(lookup.state, "ready");
  assert.equal(providerCalls, 1);
});

test("real cancellation, reschedule and settings disable invalidate before provider dispatch", () => {
  const cases = [
    [{ ...reminderContext, appointment_status: "cancelled" }, "invalidated_cancelled"],
    [{ ...reminderContext, starts_at: "2026-09-10T19:00:00Z" }, "invalidated_rescheduled"],
    [{ ...reminderContext, reminder_enabled: false }, "invalidated_disabled"]
  ] as const;
  let providerCalls = 0;
  assert.deepEqual(cases.map(([context]) => {
    const reason = getReminderPreflightInvalidation(reminderJob, context, Date.parse("2026-09-10T17:00:00Z"));
    if (!reason) providerCalls += 1;
    return reason;
  }), cases.map(([, reason]) => reason));
  assert.equal(providerCalls, 0);
});

test("an empty fenced context is treated as lost ownership and never dispatches", () => {
  let providerCalls = 0;
  const lookup = classifyAutomationContextLookup<typeof reminderContext>({ data: [], error: null });
  if (lookup.state === "ready") providerCalls += 1;
  assert.deepEqual(lookup, { state: "lostLease" });
  assert.equal(providerCalls, 0);
});

test("runner retries context transport failures and no longer persists preflight_changed", () => {
  assert.match(runner, /lookup\.state === "retryable"[\s\S]+retryContextLookup/);
  assert.match(runner, /lookup\.state === "lostLease"[\s\S]+return "lostLease"/);
  assert.doesNotMatch(runner, /"preflight_changed"|"context_unavailable"/);
});
