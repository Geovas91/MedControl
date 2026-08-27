import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { buildReviewInvitationEmail } from "@/lib/email/templates/review-invitation";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { logger } from "@/lib/logger";
import { buildReviewUrl, extractReviewToken } from "@/lib/reviews/url";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ReviewInvitationStatus } from "@/types/reviews";

type RpcResult<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type InvitationRpcClient = { rpc(name: string, args: Record<string, unknown>): RpcResult<unknown> };
type IssuedRow = { invitation_id: string; raw_token: string; expires_at: string };
type StatusRow = { invitation_id: string; invitation_status: ReviewInvitationStatus; expires_at: string; email_sent_at: string | null };
type EmailContextRow = { invitation_id: string; patient_email: string | null; clinic_name: string; doctor_display_name: string; expires_at: string };

function rows<T>(data: unknown) { return (Array.isArray(data) ? data : []) as T[]; }

export async function issueReviewInvitation(appointmentId: string) {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state } as const;
  const client = (await createClient()) as unknown as InvitationRpcClient;
  const result = await client.rpc("issue_review_invitation_for_current_user", { p_clinic_id: context.tenant.clinic.id, p_appointment_id: appointmentId });
  const row = rows<IssuedRow>(result.data)[0];
  if (result.error || !row) {
    logger.warn("Review invitation issue rejected", { component: "review_invitation", operation: "issue", code: result.error?.code, appointment_id: appointmentId });
    return { state: result.error?.code === "42501" ? "forbidden" : "invalid" } as const;
  }
  return { state: "created" as const, invitationId: row.invitation_id, reviewUrl: buildReviewUrl(getAppBaseUrl(), row.raw_token), expiresAt: row.expires_at };
}

export async function getReviewInvitationStatus(appointmentId: string, clinicId: string) {
  const client = (await createClient()) as unknown as InvitationRpcClient;
  const result = await client.rpc("get_review_invitation_status_for_current_user", { p_clinic_id: clinicId, p_appointment_id: appointmentId });
  return { data: rows<StatusRow>(result.data)[0] ?? null, error: result.error };
}

export async function revokeReviewInvitation(appointmentId: string) {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state } as const;
  const client = (await createClient()) as unknown as InvitationRpcClient;
  const result = await client.rpc("revoke_review_invitation_for_current_user", { p_clinic_id: context.tenant.clinic.id, p_appointment_id: appointmentId });
  if (result.error) return { state: result.error.code === "42501" ? "forbidden" : "error" } as const;
  return { state: result.data === true ? "revoked" : "unavailable" } as const;
}

async function recordEmailResult(client: InvitationRpcClient, input: { clinicId: string; appointmentId: string; token: string; sent: boolean; errorCode?: string }) {
  const result = await client.rpc("record_review_email_result_for_current_user", { p_clinic_id: input.clinicId, p_appointment_id: input.appointmentId, p_token: input.token, p_sent: input.sent, p_error_code: input.errorCode ?? null });
  if (result.error || result.data !== true) logger.error("Review email result could not be persisted", { component: "review_email", operation: "record_result", code: result.error?.code });
}

export async function deliverReviewInvitationEmail(input: { appointmentId: string; reviewUrl: string }) {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state } as const;
  const token = extractReviewToken(input.reviewUrl, getAppBaseUrl());
  if (!token) return { state: "invalid_link" } as const;
  const client = (await createClient()) as unknown as InvitationRpcClient;
  const lookup = await client.rpc("get_review_email_context_for_current_user", { p_clinic_id: context.tenant.clinic.id, p_appointment_id: input.appointmentId, p_token: token });
  const emailContext = rows<EmailContextRow>(lookup.data)[0];
  if (lookup.error || !emailContext) return { state: lookup.error?.code === "42501" ? "forbidden" : "invalid_link" } as const;
  if (!emailContext.patient_email) {
    await recordEmailResult(client, { clinicId: context.tenant.clinic.id, appointmentId: input.appointmentId, token, sent: false, errorCode: "missing_recipient" });
    return { state: "missing_recipient" } as const;
  }
  const configuration = getInvitationEmailConfiguration();
  if (configuration.state !== "ready" || new URL(configuration.appBaseUrl).origin !== new URL(getAppBaseUrl()).origin) {
    await recordEmailResult(client, { clinicId: context.tenant.clinic.id, appointmentId: input.appointmentId, token, sent: false, errorCode: "provider_unavailable" });
    return { state: "provider_unavailable" } as const;
  }
  const message = buildReviewInvitationEmail({ clinicName: emailContext.clinic_name, doctorDisplayName: emailContext.doctor_display_name, expiresAt: emailContext.expires_at, timeZone: context.tenant.clinic.timezone, reviewUrl: input.reviewUrl });
  const delivery = await sendWithResend(configuration, { to: emailContext.patient_email, ...message, replyTo: configuration.replyTo, idempotencyKey: `review-${emailContext.invitation_id}-${Date.parse(emailContext.expires_at)}` });
  await recordEmailResult(client, { clinicId: context.tenant.clinic.id, appointmentId: input.appointmentId, token, sent: delivery.ok, errorCode: delivery.ok ? undefined : delivery.code });
  if (!delivery.ok) {
    logger.error("Review email failed without affecting the invitation", { component: "review_email", operation: "delivery", code: delivery.code, invitation_id: emailContext.invitation_id });
    return { state: "delivery_failed" } as const;
  }
  return { state: "sent" as const };
}
