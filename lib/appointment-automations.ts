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
