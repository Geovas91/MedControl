import "server-only";

import { randomUUID } from "node:crypto";
import {
  APPOINTMENT_AUTOMATION_BATCH_LIMIT,
  APPOINTMENT_AUTOMATION_LEASE_SECONDS,
  getAutomationRetryDelayMs,
  sanitizeAutomationCounters,
  shouldRetryAutomationEmail,
  type AutomationRunCounters
} from "@/lib/appointment-automations";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { buildAppointmentReminderEmail } from "@/lib/email/templates/appointment-reminder";
import { buildReviewInvitationEmail } from "@/lib/email/templates/review-invitation";
import { logger } from "@/lib/logger";
import { buildReviewUrl } from "@/lib/reviews/url";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }> };
type Job = { id: string; clinic_id: string; appointment_id: string; type: "reminder_email" | "review_request_email"; source_version: string; attempts: number; max_attempts: number; scheduled_for: string };
type Context = { clinic_id: string; appointment_id: string; job_type: Job["type"]; source_version: string; appointment_status: string; starts_at: string; doctor_user_id: string | null; clinic_name: string; clinic_timezone: string; patient_email: string | null; doctor_display_name: string | null; valid_subscription: boolean; assistant_enabled: boolean; reminder_enabled: boolean; review_request_enabled: boolean; invitation_exists: boolean; review_exists: boolean };
type Issued = { invitation_id: string; raw_token: string; expires_at: string };

const compatibleEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const rows = <T>(data: unknown) => (Array.isArray(data) ? data : []) as T[];

async function finish(client: RpcClient, job: Job, workerId: string, outcome: "succeeded" | "skipped" | "retry" | "failed", errorCode?: string) {
  const retryAt = outcome === "retry" ? new Date(Date.now() + getAutomationRetryDelayMs(job.attempts)).toISOString() : null;
  await client.rpc("finish_appointment_automation_job", {
    p_job_id: job.id, p_worker_id: workerId, p_outcome: outcome,
    p_error_code: errorCode ?? null, p_retry_at: retryAt
  });
}
function validSharedPreflight(job: Job, context: Context) {
  return context.clinic_id === job.clinic_id
    && context.appointment_id === job.appointment_id
    && context.source_version === job.source_version
    && context.valid_subscription
    && context.assistant_enabled
    && Boolean(context.patient_email && compatibleEmail.test(context.patient_email))
    && Boolean(context.doctor_display_name);
}

async function loadCurrentContext(client: RpcClient, job: Job, workerId: string) {
  const lookup = await client.rpc("get_appointment_automation_context", { p_job_id: job.id, p_worker_id: workerId });
  return lookup.error ? null : rows<Context>(lookup.data)[0] ?? null;
}

async function processReminder(client: RpcClient, job: Job, context: Context, workerId: string) {
  if (!validSharedPreflight(job, context) || !context.reminder_enabled
    || !["scheduled", "confirmed", "waiting"].includes(context.appointment_status)
    || Date.parse(context.starts_at) <= Date.now()) {
    await finish(client, job, workerId, "skipped", "preflight_unavailable");
    return "skipped" as const;
  }
  const configuration = getInvitationEmailConfiguration();
  if (configuration.state !== "ready") {
    await finish(client, job, workerId, "skipped", "provider_unavailable");
    return "skipped" as const;
  }
  // Final gate after claim and provider readiness: appointment/settings/subscription may have changed.
  const current = await loadCurrentContext(client, job, workerId);
  if (!current || !validSharedPreflight(job, current) || !current.reminder_enabled
    || !["scheduled", "confirmed", "waiting"].includes(current.appointment_status)
    || Date.parse(current.starts_at) <= Date.now()) {
    await finish(client, job, workerId, "skipped", "preflight_changed");
    return "skipped" as const;
  }
  const message = buildAppointmentReminderEmail({
    clinicName: current.clinic_name, doctorDisplayName: current.doctor_display_name!,
    startsAt: current.starts_at, timeZone: current.clinic_timezone
  });
  const delivery = await sendWithResend(configuration, {
    to: current.patient_email!, ...message, replyTo: configuration.replyTo,
    idempotencyKey: `appointment-reminder-${job.id}`
  });
  if (delivery.ok) {
    await finish(client, job, workerId, "succeeded");
    return "succeeded" as const;
  }
  if (shouldRetryAutomationEmail(delivery.code) && job.attempts < job.max_attempts) {
    await finish(client, job, workerId, "retry", delivery.code);
    return "retryPending" as const;
  }
  await finish(client, job, workerId, "failed", delivery.code);
  return "failed" as const;
}

async function processReview(client: RpcClient, job: Job, context: Context, workerId: string) {
  const configuration = getInvitationEmailConfiguration();
  if (!validSharedPreflight(job, context) || !context.review_request_enabled
    || context.appointment_status !== "completed" || context.invitation_exists || context.review_exists
    || configuration.state !== "ready") {
    await finish(client, job, workerId, "skipped", "preflight_unavailable");
    return "skipped" as const;
  }
  const issue = await client.rpc("issue_review_invitation_for_automation", { p_job_id: job.id, p_worker_id: workerId });
  const invitation = rows<Issued>(issue.data)[0];
  if (issue.error || !invitation) {
    await finish(client, job, workerId, "skipped", "invitation_unavailable");
    return "skipped" as const;
  }
  // Issuance itself revalidates completed/profile/subscription/settings/email in SQL.
  // Recheck once more before the provider call; if state changed, keep the invitation for manual recovery.
  const current = await loadCurrentContext(client, job, workerId);
  if (!current || !validSharedPreflight(job, current) || !current.review_request_enabled
    || current.appointment_status !== "completed") {
    await finish(client, job, workerId, "skipped", "preflight_changed");
    return "skipped" as const;
  }
  const reviewUrl = buildReviewUrl(getAppBaseUrl(), invitation.raw_token);
  const message = buildReviewInvitationEmail({
    clinicName: current.clinic_name, doctorDisplayName: current.doctor_display_name!,
    expiresAt: invitation.expires_at, timeZone: current.clinic_timezone, reviewUrl
  });
  const delivery = await sendWithResend(configuration, {
    to: current.patient_email!, ...message, replyTo: configuration.replyTo,
    idempotencyKey: `review-automation-${invitation.invitation_id}`
  });
  await client.rpc("record_review_email_result_for_automation", {
    p_job_id: job.id, p_worker_id: workerId, p_invitation_id: invitation.invitation_id,
    p_sent: delivery.ok, p_error_code: delivery.ok ? null : delivery.code
  });
  // The token plaintext existed only in this invocation. Never retry or regenerate after issuance.
  await finish(client, job, workerId, delivery.ok ? "succeeded" : "failed", delivery.ok ? undefined : delivery.code);
  return delivery.ok ? "succeeded" as const : "failed" as const;
}

export async function runAppointmentAutomations(): Promise<AutomationRunCounters> {
  const client = createAdminClient() as unknown as RpcClient;
  const workerId = `worker_${randomUUID()}`;
  const counters = sanitizeAutomationCounters({});
  await client.rpc("record_appointment_automation_heartbeat", { p_phase: "start" });
  try {
    const claim = await client.rpc("claim_due_appointment_automation_jobs", {
      p_worker_id: workerId, p_limit: APPOINTMENT_AUTOMATION_BATCH_LIMIT,
      p_lease_seconds: APPOINTMENT_AUTOMATION_LEASE_SECONDS
    });
    if (claim.error) throw new Error(`claim_${claim.error.code ?? "failed"}`);
    const jobs = rows<Job>(claim.data);
    counters.claimed = jobs.length;
    for (const job of jobs) {
      try {
        const context = await loadCurrentContext(client, job, workerId);
        if (!context) {
          await finish(client, job, workerId, "skipped", "context_unavailable");
          counters.skipped += 1;
          continue;
        }
        const outcome = job.type === "reminder_email"
          ? await processReminder(client, job, context, workerId)
          : await processReview(client, job, context, workerId);
        counters[outcome] += 1;
      } catch {
        await finish(client, job, workerId, "failed", "runner_error");
        counters.failed += 1;
        logger.error("Appointment automation job failed", { component: "appointment_automation", code: "runner_error", job_id: job.id });
      }
    }
    await client.rpc("record_appointment_automation_heartbeat", {
      p_phase: "finish", p_status: "ok", p_claimed: counters.claimed,
      p_succeeded: counters.succeeded, p_skipped: counters.skipped,
      p_failed: counters.failed
    });
    return sanitizeAutomationCounters(counters);
  } catch {
    await client.rpc("record_appointment_automation_heartbeat", { p_phase: "finish", p_status: "error" });
    logger.error("Appointment automation runner failed", { component: "appointment_automation", code: "runner_failed" });
    throw new Error("Appointment automation run failed.");
  }
}
