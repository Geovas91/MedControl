import "server-only";

import { logger } from "@/lib/logger";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { buildMemberInvitationEmail } from "@/lib/email/templates/member-invitation";
import type { ClinicMemberRole } from "@/lib/supabase/clinic-members";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { recordInvitationEmailDelivery } from "@/lib/server/invitation-email-delivery-store";
import { getInvitationDeliveryStatus } from "@/lib/email/delivery-status";
import type { InvitationEmailDeliveryStatus } from "@/lib/email/types";

export type InvitationDeliveryOutcome = InvitationEmailDeliveryStatus;

function buildInvitationUrl(appBaseUrl: string, rawToken: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(rawToken)) throw new Error("Invalid invitation token.");
  return new URL(`/invite/${rawToken}`, appBaseUrl).toString();
}

async function recordResult(input: { invitationId: string; clinicId: string; role: Exclude<ClinicMemberRole, "owner">; status: InvitationDeliveryOutcome; provider: "resend" | null; messageId?: string; errorCode?: string }) {
  const { error } = await recordInvitationEmailDelivery({ invitationId: input.invitationId, clinicId: input.clinicId, status: input.status, provider: input.provider, messageId: input.messageId, errorCode: input.errorCode });
  if (error) {
    logger.error("Invitation email result persistence failed", {
      component: "invitation_email",
      operation: "record_result",
      status: "persistence_failed",
      invitation_id: input.invitationId,
      clinic_id: input.clinicId,
      provider: input.provider ?? "disabled"
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
    await recordResult({ invitationId: input.invitationId, clinicId: input.clinicId, role: input.role, status: "disabled", provider: null });
    return { status: "disabled" as const, invitationUrl: buildInvitationUrl(getAppBaseUrl(), input.rawToken) };
  }

  const invitationUrl = buildInvitationUrl(configuration.appBaseUrl, input.rawToken);
  const template = buildMemberInvitationEmail({ clinicName: input.clinicName, role: input.role, expiresAt: input.expiresAt, invitationUrl });
  const result = await sendWithResend(configuration, { to: input.invitedEmail, ...template, replyTo: configuration.replyTo });

  if (result.ok) {
    await recordResult({ invitationId: input.invitationId, clinicId: input.clinicId, role: input.role, status: "sent", provider: "resend", messageId: result.messageId });
    logger.info("Invitation email sent", { component: "invitation_email", operation: "send", status: "sent", invitation_id: input.invitationId, clinic_id: input.clinicId, provider: "resend" });
    return { status: "sent" as const, invitationUrl };
  }

  const status = getInvitationDeliveryStatus(result);
  await recordResult({ invitationId: input.invitationId, clinicId: input.clinicId, role: input.role, status, provider: "resend", errorCode: result.code });
  logger.warn("Invitation email delivery was not confirmed", { component: "invitation_email", operation: "send", status: result.code, invitation_id: input.invitationId, clinic_id: input.clinicId, provider: "resend" });
  return { status, invitationUrl };
}
