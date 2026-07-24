import "server-only";

import { logger } from "@/lib/logger";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { buildMemberInvitationEmail } from "@/lib/email/templates/member-invitation";
import { recordClinicInvitationEmailResult, type ClinicMemberRole } from "@/lib/supabase/clinic-members";
import { getAppBaseUrl } from "@/lib/supabase/config";

export type InvitationDeliveryOutcome = "sent" | "failed" | "disabled";

function buildInvitationUrl(appBaseUrl: string, rawToken: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(rawToken)) throw new Error("Invalid invitation token.");
  return new URL(`/invite/${rawToken}`, appBaseUrl).toString();
}

async function recordResult(input: { invitationId: string; clinicId: string; role: Exclude<ClinicMemberRole, "owner">; status: InvitationDeliveryOutcome; messageId?: string; errorCode?: string }) {
  const { error } = await recordClinicInvitationEmailResult(input.invitationId, input.status, input.messageId ?? null, input.errorCode ?? null);
  if (error) {
    logger.error("Invitation email result persistence failed", {
      component: "invitation_email",
      operation: "record_result",
      status: "persistence_failed",
      invitation_id: input.invitationId,
      clinic_id: input.clinicId,
      provider: "resend"
    });
  }
}

export async function deliverMemberInvitation(input: {
  invitationId: string;
  clinicId: string;
  clinicName: string;
  invitedEmail: string;
  role: Exclude<ClinicMemberRole, "owner">;
  expiresAt: string;
  rawToken: string;
}) {
  const configuration = getInvitationEmailConfiguration();
  if (configuration.state !== "ready") {
    await recordResult({ invitationId: input.invitationId, clinicId: input.clinicId, role: input.role, status: "disabled" });
    return { status: "disabled" as const, invitationUrl: buildInvitationUrl(getAppBaseUrl(), input.rawToken) };
  }

  const invitationUrl = buildInvitationUrl(configuration.appBaseUrl, input.rawToken);
  const template = buildMemberInvitationEmail({ clinicName: input.clinicName, role: input.role, expiresAt: input.expiresAt, invitationUrl });
  const result = await sendWithResend(configuration, { to: input.invitedEmail, ...template, replyTo: configuration.replyTo });

  if (result.ok) {
    await recordResult({ invitationId: input.invitationId, clinicId: input.clinicId, role: input.role, status: "sent", messageId: result.messageId });
    logger.info("Invitation email sent", { component: "invitation_email", operation: "send", status: "sent", invitation_id: input.invitationId, clinic_id: input.clinicId, provider: "resend" });
    return { status: "sent" as const, invitationUrl };
  }

  await recordResult({ invitationId: input.invitationId, clinicId: input.clinicId, role: input.role, status: "failed", errorCode: result.code });
  logger.warn("Invitation email delivery failed", { component: "invitation_email", operation: "send", status: result.code, invitation_id: input.invitationId, clinic_id: input.clinicId, provider: "resend" });
  return { status: "failed" as const, invitationUrl };
}
