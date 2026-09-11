import "server-only";

import { randomUUID } from "node:crypto";
import {
  APPOINTMENT_AUTOMATION_BATCH_LIMIT,
  APPOINTMENT_AUTOMATION_LEASE_SECONDS,
  classifyAutomationContextLookup,
  classifyAutomationFinalization,
  confirmAutomationMutation,
  getReminderPreflightInvalidation,
  getReviewPreflightInvalidation,
  getAutomationRetryDelayMs,
  sanitizeAutomationCounters,
  shouldRetryAutomationEmail,
  type AutomationRunCounters
} from "@/lib/appointment-automations";
import { runWithAppointmentAutomationHeartbeat } from "@/lib/appointment-automation-heartbeat";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { buildAppointmentReminderEmail } from "@/lib/email/templates/appointment-reminder";
import { buildReviewInvitationEmail } from "@/lib/email/templates/review-invitation";
import { logger } from "@/lib/logger";
import { buildReviewUrl } from "@/lib/reviews/url";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }> };
type Job = { id: string; clinic_id: string; appointment_id: string; type: "reminder_email" | "review_request_email" | "reminder_whatsapp"; source_version: string; attempts: number; max_attempts: number; scheduled_for: string; lease_token: string; delivery_state: string };
type Context = { clinic_id: string; appointment_id: string; job_type: Job["type"]; source_version: string; appointment_status: string; starts_at: string; doctor_user_id: string | null; clinic_name: string; clinic_timezone: string; patient_email: string | null; doctor_display_name: string | null; valid_subscription: boolean; assistant_enabled: boolean; reminder_enabled: boolean; review_request_enabled: boolean; invitation_exists: boolean; review_exists: boolean };
type Issued = { invitation_id: string; raw_token: string; expires_at: string };

const rows = <T>(data: unknown) => (Array.isArray(data) ? data : []) as T[];

async function rpcConfirmed(client: RpcClient, name: string, args: Record<string, unknown>) {
  return confirmAutomationMutation(() => client.rpc(name, args));
}

async function finish(client: RpcClient, job: Job, workerId: string, outcome: "succeeded" | "skipped" | "retry" | "failed", errorCode?: string) {
  const retryAt = outcome === "retry" ? new Date(Date.now() + getAutomationRetryDelayMs(job.attempts)).toISOString() : null;
  return rpcConfirmed(client, "finish_appointment_automation_job", {
    p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token, p_outcome: outcome,
    p_error_code: errorCode ?? null, p_retry_at: retryAt
  });
}

const renew = (client: RpcClient, job: Job, workerId: string) => rpcConfirmed(client, "renew_appointment_automation_job_lease", {
  p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token,
  p_lease_seconds: APPOINTMENT_AUTOMATION_LEASE_SECONDS
});
const beginDelivery = (client: RpcClient, job: Job, workerId: string) => rpcConfirmed(client, "begin_appointment_automation_delivery", {
  p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token
});
const markAccepted = (client: RpcClient, job: Job, workerId: string) => rpcConfirmed(client, "mark_appointment_automation_delivery_accepted", {
  p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token
});
async function loadCurrentContext(client: RpcClient, job: Job, workerId: string) {
  try {
    const lookup = await client.rpc("get_appointment_automation_context", { p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token });
    return classifyAutomationContextLookup<Context>(lookup);
  } catch {
    return { state: "retryable", code: "rpc_exception" } as const;
  }
}

function logPreflight(job: Job, stage: "initial" | "final", reason: string, retryable: boolean) {
  logger.warn("Appointment automation preflight blocked", {
    component: "appointment_automation",
    code: reason,
    job_id: job.id,
    stage,
    retryable
  });
}

async function retryContextLookup(
  client: RpcClient,
  job: Job,
  workerId: string,
  stage: "initial" | "final",
  rpcCode: string
) {
  logger.warn("Appointment automation context lookup failed", {
    component: "appointment_automation",
    code: "context_lookup_failed",
    rpc_code: rpcCode,
    job_id: job.id,
    stage,
    retryable: true
  });
  const retryable = job.attempts < job.max_attempts;
  return classifyAutomationFinalization(
    retryable ? "retryPending" : "failed",
    await finish(client, job, workerId, retryable ? "retry" : "failed", "context_lookup_failed")
  );
}

async function processReminder(client: RpcClient, job: Job, context: Context, workerId: string) {
  const initialInvalidation = getReminderPreflightInvalidation(job, context);
  if (initialInvalidation) {
    logPreflight(job, "initial", initialInvalidation, false);
    return classifyAutomationFinalization("skipped", await finish(client, job, workerId, "skipped", initialInvalidation));
  }
  const configuration = getInvitationEmailConfiguration();
  if (configuration.state !== "ready") {
    return classifyAutomationFinalization("skipped", await finish(client, job, workerId, "skipped", "provider_unavailable"));
  }
  // Final gate after claim and provider readiness: appointment/settings/subscription may have changed.
  const lookup = await loadCurrentContext(client, job, workerId);
  if (lookup.state === "retryable") return retryContextLookup(client, job, workerId, "final", lookup.code);
  if (lookup.state === "lostLease") return "lostLease" as const;
  const current = lookup.context;
  const finalInvalidation = getReminderPreflightInvalidation(job, current);
  if (finalInvalidation) {
    logPreflight(job, "final", finalInvalidation, false);
    return classifyAutomationFinalization("skipped", await finish(client, job, workerId, "skipped", finalInvalidation));
  }
  if (!await renew(client, job, workerId) || !await beginDelivery(client, job, workerId)) return "lostLease" as const;
  const message = buildAppointmentReminderEmail({
    clinicName: current.clinic_name, doctorDisplayName: current.doctor_display_name!,
    startsAt: current.starts_at, timeZone: current.clinic_timezone
  });
  const delivery = await sendWithResend(configuration, {
    to: current.patient_email!, ...message, replyTo: configuration.replyTo,
    idempotencyKey: `appointment-reminder-${job.id}`
  });
  if (delivery.ok) {
    if (!await markAccepted(client, job, workerId)) return "uncertain" as const;
    return classifyAutomationFinalization("succeeded", await finish(client, job, workerId, "succeeded"), true);
  }
  if (shouldRetryAutomationEmail(delivery.code) && job.attempts < job.max_attempts) {
    return classifyAutomationFinalization("retryPending", await finish(client, job, workerId, "retry", delivery.code));
  }
  return classifyAutomationFinalization("failed", await finish(client, job, workerId, "failed", delivery.code));
}

async function processReview(client: RpcClient, job: Job, context: Context, workerId: string) {
  const configuration = getInvitationEmailConfiguration();
  const initialInvalidation = getReviewPreflightInvalidation(job, context);
  if (initialInvalidation || configuration.state !== "ready") {
    const reason = initialInvalidation ?? "provider_unavailable";
    logPreflight(job, "initial", reason, false);
    return classifyAutomationFinalization("skipped", await finish(client, job, workerId, "skipped", reason));
  }
  const issue = await client.rpc("issue_review_invitation_for_automation", { p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token });
  const invitation = rows<Issued>(issue.data)[0];
  if (issue.error || !invitation) {
    return classifyAutomationFinalization("skipped", await finish(client, job, workerId, "skipped", "invitation_unavailable"));
  }
  // Issuance itself revalidates completed/profile/subscription/settings/email in SQL.
  // Recheck once more before the provider call; if state changed, keep the invitation for manual recovery.
  const lookup = await loadCurrentContext(client, job, workerId);
  if (lookup.state === "retryable") {
    logPreflight(job, "final", "review_context_lookup_failed", false);
    return classifyAutomationFinalization("failed", await finish(client, job, workerId, "failed", "review_context_lookup_failed"));
  }
  if (lookup.state === "lostLease") return "lostLease" as const;
  const current = lookup.context;
  const finalInvalidation = getReviewPreflightInvalidation(job, { ...current, invitation_exists: false });
  if (finalInvalidation) {
    logPreflight(job, "final", finalInvalidation, false);
    return classifyAutomationFinalization("skipped", await finish(client, job, workerId, "skipped", finalInvalidation));
  }
  if (!await renew(client, job, workerId) || !await beginDelivery(client, job, workerId)) return "lostLease" as const;
  const reviewUrl = buildReviewUrl(getAppBaseUrl(), invitation.raw_token);
  const message = buildReviewInvitationEmail({
    clinicName: current.clinic_name, doctorDisplayName: current.doctor_display_name!,
    expiresAt: invitation.expires_at, timeZone: current.clinic_timezone, reviewUrl
  });
  const delivery = await sendWithResend(configuration, {
    to: current.patient_email!, ...message, replyTo: configuration.replyTo,
    idempotencyKey: `review-automation-${invitation.invitation_id}`
  });
  if (delivery.ok && !await markAccepted(client, job, workerId)) return "uncertain" as const;
  const reviewPersisted = await rpcConfirmed(client, "record_review_email_result_for_automation", {
    p_job_id: job.id, p_worker_id: workerId, p_lease_token: job.lease_token, p_invitation_id: invitation.invitation_id,
    p_sent: delivery.ok, p_error_code: delivery.ok ? null : delivery.code
  });
  if (!reviewPersisted) return classifyAutomationFinalization(delivery.ok ? "succeeded" : "failed", false, delivery.ok);
  // The token plaintext existed only in this invocation. Never retry or regenerate after issuance.
  const finalized = await finish(client, job, workerId, delivery.ok ? "succeeded" : "failed", delivery.ok ? undefined : delivery.code);
  return classifyAutomationFinalization(delivery.ok ? "succeeded" : "failed", finalized, delivery.ok);
}

export async function runAppointmentAutomations(): Promise<AutomationRunCounters> {
  const client = createAdminClient() as unknown as RpcClient;
  const workerId = `worker_${randomUUID()}`;
  return runWithAppointmentAutomationHeartbeat(client, async () => {
    const counters = sanitizeAutomationCounters({});
    const claim = await client.rpc("claim_due_appointment_automation_jobs", {
      p_worker_id: workerId, p_limit: APPOINTMENT_AUTOMATION_BATCH_LIMIT,
      p_lease_seconds: APPOINTMENT_AUTOMATION_LEASE_SECONDS
    });
    if (claim.error) throw new Error(`claim_${claim.error.code ?? "failed"}`);
    const jobs = rows<Job>(claim.data);
    counters.claimed = jobs.length;
    for (const job of jobs) {
      try {
        if (job.type === "reminder_whatsapp") {
          // Phase 1 persists the domain only. No Meta call is reachable until a later phase explicitly enables it.
          const skipped = await finish(client, job, workerId, "skipped", "provider_not_enabled");
          counters[skipped ? "skipped" : "lostLease"] += 1;
          continue;
        }
        const lookup = await loadCurrentContext(client, job, workerId);
        if (lookup.state === "retryable") {
          const outcome = await retryContextLookup(client, job, workerId, "initial", lookup.code);
          counters[outcome] += 1;
          continue;
        }
        if (lookup.state === "lostLease") {
          counters.lostLease += 1;
          continue;
        }
        const context = lookup.context;
        const outcome = job.type === "reminder_email"
          ? await processReminder(client, job, context, workerId)
          : await processReview(client, job, context, workerId);
        counters[outcome] += 1;
        if (outcome === "uncertain" || outcome === "lostLease") {
          logger.error("Appointment automation persistence not confirmed", {
            component: "appointment_automation",
            code: outcome === "uncertain" ? "delivery_persistence_uncertain" : "lease_ownership_lost",
            job_id: job.id
          });
        }
      } catch {
        // The exception may have happened during the provider call. Lease recovery inspects
        // the durable delivery state, so this worker must not finalize or resend blindly.
        counters.uncertain += 1;
        logger.error("Appointment automation job failed", { component: "appointment_automation", code: "runner_error", job_id: job.id });
      }
    }
    return sanitizeAutomationCounters(counters);
  }, logger);
}
