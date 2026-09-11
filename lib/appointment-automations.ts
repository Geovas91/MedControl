import { createHash, timingSafeEqual } from "node:crypto";

export const APPOINTMENT_AUTOMATION_BATCH_LIMIT = 20;
export const APPOINTMENT_AUTOMATION_LEASE_SECONDS = 90;

export function isAuthorizedAutomationCron(provided: string | null, expected: string | undefined) {
  if (!provided || !expected || expected.length < 24) return false;
  const left = createHash("sha256").update(provided, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function getAutomationRetryDelayMs(attempt: number) {
  return [60_000, 5 * 60_000, 15 * 60_000][Math.max(0, Math.min(attempt - 1, 2))];
}

export function shouldRetryAutomationEmail(code: string) {
  return code === "rate_limited";
}

type AutomationContextLookupResult<T> =
  | { state: "ready"; context: T }
  | { state: "retryable"; code: string }
  | { state: "lostLease" };

export function classifyAutomationContextLookup<T>(result: {
  data: unknown;
  error: { code?: string } | null;
}): AutomationContextLookupResult<T> {
  if (result.error) {
    const normalized = typeof result.error.code === "string" ? result.error.code.toUpperCase() : "";
    return {
      state: "retryable",
      code: /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(normalized) ? normalized.toLowerCase() : "rpc_error"
    };
  }
  const context = Array.isArray(result.data) ? result.data[0] as T | undefined : undefined;
  return context ? { state: "ready", context } : { state: "lostLease" };
}

type AutomationPreflightJob = {
  clinic_id: string;
  appointment_id: string;
  source_version: string;
};

type AutomationPreflightContext = {
  clinic_id: string;
  appointment_id: string;
  appointment_status: string;
  starts_at: string;
  patient_email: string | null;
  doctor_display_name: string | null;
  valid_subscription: boolean;
  assistant_enabled: boolean;
};

export type AutomationPreflightInvalidation =
  | "invalidated_context"
  | "invalidated_cancelled"
  | "invalidated_rescheduled"
  | "invalidated_disabled"
  | "invalidated_destination"
  | "invalidated_entitlement"
  | "invalidated_window";

const automationEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function sameInstant(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function getSharedPreflightInvalidation(
  job: AutomationPreflightJob,
  context: AutomationPreflightContext
): AutomationPreflightInvalidation | null {
  if (context.clinic_id !== job.clinic_id || context.appointment_id !== job.appointment_id) {
    return "invalidated_context";
  }
  if (!sameInstant(context.starts_at, job.source_version)) return "invalidated_rescheduled";
  if (!context.valid_subscription) return "invalidated_entitlement";
  if (!context.assistant_enabled) return "invalidated_disabled";
  if (!context.patient_email || !automationEmail.test(context.patient_email) || !context.doctor_display_name) {
    return "invalidated_destination";
  }
  return null;
}

export function getReminderPreflightInvalidation(
  job: AutomationPreflightJob,
  context: AutomationPreflightContext & { reminder_enabled: boolean },
  now = Date.now()
): AutomationPreflightInvalidation | null {
  const shared = getSharedPreflightInvalidation(job, context);
  if (shared) return shared;
  if (context.appointment_status === "cancelled") return "invalidated_cancelled";
  if (!["scheduled", "confirmed", "waiting"].includes(context.appointment_status)) return "invalidated_context";
  if (!context.reminder_enabled) return "invalidated_disabled";
  if (Date.parse(context.starts_at) <= now) return "invalidated_window";
  return null;
}

export function getReviewPreflightInvalidation(
  job: AutomationPreflightJob,
  context: AutomationPreflightContext & {
    review_request_enabled: boolean;
    invitation_exists: boolean;
    review_exists: boolean;
  }
): AutomationPreflightInvalidation | "superseded" | null {
  const shared = getSharedPreflightInvalidation(job, context);
  if (shared) return shared;
  if (context.appointment_status !== "completed") return "invalidated_context";
  if (!context.review_request_enabled) return "invalidated_disabled";
  if (context.invitation_exists || context.review_exists) return "superseded";
  return null;
}

export async function confirmAutomationMutation(
  call: () => Promise<{ data: unknown; error: unknown }>
) {
  try {
    const result = await call();
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}

export function classifyAutomationFinalization<T extends "succeeded" | "skipped" | "retryPending" | "failed">(
  expected: T,
  confirmed: boolean,
  providerAccepted = false
): T | "uncertain" | "lostLease" {
  if (confirmed) return expected;
  return providerAccepted ? "uncertain" : "lostLease";
}

export function sanitizeAutomationCounters(value: Partial<AutomationRunCounters>): AutomationRunCounters {
  const safe = (candidate: unknown) => Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : 0;
  return {
    claimed: safe(value.claimed),
    succeeded: safe(value.succeeded),
    skipped: safe(value.skipped),
    retryPending: safe(value.retryPending),
    failed: safe(value.failed),
    uncertain: safe(value.uncertain),
    lostLease: safe(value.lostLease)
  };
}

export type AutomationRunCounters = {
  claimed: number;
  succeeded: number;
  skipped: number;
  retryPending: number;
  failed: number;
  uncertain: number;
  lostLease: number;
};

export type AutomationRunHttpResult =
  | { status: 200; body: AutomationRunCounters }
  | { status: 500; body: { error: "run_failed" } };

export async function executeAppointmentAutomationEndpoint(
  run: () => Promise<AutomationRunCounters>
): Promise<AutomationRunHttpResult> {
  try {
    return { status: 200, body: sanitizeAutomationCounters(await run()) };
  } catch {
    return { status: 500, body: { error: "run_failed" } };
  }
}
