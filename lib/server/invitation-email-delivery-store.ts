import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { listClinicInvitations } from "@/lib/supabase/clinic-members";
import type { InvitationEmailDeliveryStatus } from "@/lib/email/types";

type InvitationDeliveryAdminClient = {
  rpc(
    fn: "record_clinic_member_invitation_email_result_internal",
    args: {
      p_invitation_id: string;
      p_actor_user_id: string;
      p_delivery_status: InvitationEmailDeliveryStatus;
      p_provider_message_id: string | null;
      p_error_code: string | null;
      p_provider: "resend" | null;
    }
  ): Promise<{ error: unknown | null }>;
};

export async function recordInvitationEmailDelivery(input: {
  invitationId: string;
  clinicId: string;
  status: InvitationEmailDeliveryStatus;
  provider: "resend" | null;
  messageId?: string;
  errorCode?: string;
}) {
  const context = await getActiveTenantContext();
  if (context.state !== "ready" || context.tenant.clinic.id !== input.clinicId || !["owner", "admin"].includes(context.tenant.membership.role)) {
    return { error: "not_authorized" as const };
  }

  const { data: invitations, error: invitationError } = await listClinicInvitations(input.clinicId);
  if (invitationError || !invitations?.some((invitation) => invitation.id === input.invitationId)) {
    return { error: "invitation_unavailable" as const };
  }

  try {
    const admin = createAdminClient();
    const { error } = await (admin as unknown as InvitationDeliveryAdminClient).rpc("record_clinic_member_invitation_email_result_internal", {
      p_invitation_id: input.invitationId,
      p_actor_user_id: context.user.id,
      p_delivery_status: input.status,
      p_provider_message_id: input.messageId ?? null,
      p_error_code: input.errorCode ?? null,
      p_provider: input.provider
    });
    return error ? { error: "persistence_failed" as const } : { error: null };
  } catch {
    return { error: "persistence_failed" as const };
  }
}
