"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import {
  createClinicInvitation,
  listClinicInvitations,
  revokeClinicInvitation,
  rotateClinicInvitation,
  type ClinicMemberRole
} from "@/lib/supabase/clinic-members";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { deliverMemberInvitation } from "@/lib/server/invitation-email";
import { logger } from "@/lib/logger";

export type InvitationActionState = {
  error?: string;
  message?: string;
  invitationUrl?: string;
  deliveryStatus?: "sent" | "failed" | "disabled";
};

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isSupportedRole(role: string): role is Exclude<ClinicMemberRole, "owner"> {
  return role === "doctor" || role === "admin" || role === "assistant";
}

export async function addClinicMemberAction(
  _previousState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const email = asString(formData.get("email")).toLowerCase();
  const role = asString(formData.get("role"));
  const activeTenant = await getActiveTenantContext();

  if (activeTenant.state === "unauthenticated") {
    redirect("/login");
  }

  if (activeTenant.state !== "ready") {
    return { error: "No tienes una membresía activa para administrar invitaciones." };
  }

  if (!canCreateWithEntitlements(await getClinicEntitlements(activeTenant.tenant.clinic.id))) {
    return { error: "La suscripción actual no permite administrar miembros." };
  }

  if (!email || !role) {
    return { error: "Completa correo y rol para crear una invitación." };
  }

  if (!isSupportedRole(role)) {
    return { error: "Selecciona un rol válido para el miembro." };
  }

  const { data, error } = await createClinicInvitation(activeTenant.tenant.clinic.id, email, role);

  if (error) {
    return { error: error.message };
  }

  const invitation = data?.[0];
  if (!invitation) return { error: "No fue posible crear la invitación." };
  const fallbackUrl = new URL(`/invite/${invitation.raw_token}`, getAppBaseUrl()).toString();
  try {
    const delivery = await deliverMemberInvitation({
      invitationId: invitation.invitation_id,
      clinicId: activeTenant.tenant.clinic.id,
      clinicName: activeTenant.tenant.clinic.name,
      invitedEmail: invitation.invited_email,
      role: invitation.invited_role,
      expiresAt: invitation.expires_at,
      rawToken: invitation.raw_token
    });
    revalidatePath("/dashboard/members");
    if (delivery.status === "sent") return { message: "Invitación creada y correo enviado.", invitationUrl: delivery.invitationUrl, deliveryStatus: "sent" };
    if (delivery.status === "failed") return { message: "Invitación creada, pero el correo no pudo enviarse. Copia el enlace.", invitationUrl: delivery.invitationUrl, deliveryStatus: "failed" };
    return { message: "Invitación creada. El correo no está configurado; copia el enlace.", invitationUrl: delivery.invitationUrl, deliveryStatus: "disabled" };
  } catch {
    logger.error("Invitation email orchestration failed", { component: "invitation_email", operation: "send", status: "unexpected_error", invitation_id: invitation.invitation_id, clinic_id: activeTenant.tenant.clinic.id, provider: "resend" });
    revalidatePath("/dashboard/members");
    return { message: "Invitación creada, pero el correo no pudo enviarse. Copia el enlace.", invitationUrl: fallbackUrl, deliveryStatus: "failed" };
  }
}

export async function rotateClinicInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const invitationId = asString(formData.get("invitation_id"));
  if (!invitationId) return { error: "No fue posible identificar la invitación." };

  const activeTenant = await getActiveTenantContext();
  if (activeTenant.state === "unauthenticated") redirect("/login");
  if (activeTenant.state !== "ready") return { error: "No tienes una membresía activa para administrar invitaciones." };
  const { data, error } = await rotateClinicInvitation(invitationId);
  if (error || !data?.[0]) return { error: error?.message ?? "No fue posible rotar el enlace." };
  const { data: invitations } = await listClinicInvitations(activeTenant.tenant.clinic.id);
  const details = invitations?.find((item) => item.id === invitationId);
  const fallbackUrl = new URL(`/invite/${data[0].raw_token}`, getAppBaseUrl()).toString();
  if (!details) return { message: "Se generó un enlace nuevo. El enlace anterior dejó de ser válido; copia el enlace.", invitationUrl: fallbackUrl, deliveryStatus: "failed" };
  try {
    const delivery = await deliverMemberInvitation({ invitationId, clinicId: activeTenant.tenant.clinic.id, clinicName: activeTenant.tenant.clinic.name, invitedEmail: details.invited_email, role: details.role, expiresAt: data[0].expires_at, rawToken: data[0].raw_token });
    revalidatePath("/dashboard/members");
    if (delivery.status === "sent") return { message: "Se generó un enlace nuevo y correo enviado.", invitationUrl: delivery.invitationUrl, deliveryStatus: "sent" };
    if (delivery.status === "failed") return { message: "Se generó un enlace nuevo, pero el correo no pudo enviarse. Copia el enlace.", invitationUrl: delivery.invitationUrl, deliveryStatus: "failed" };
    return { message: "Se generó un enlace nuevo. El correo no está configurado; copia el enlace.", invitationUrl: delivery.invitationUrl, deliveryStatus: "disabled" };
  } catch {
    logger.error("Invitation rotation email orchestration failed", { component: "invitation_email", operation: "send", status: "unexpected_error", invitation_id: invitationId, clinic_id: activeTenant.tenant.clinic.id, provider: "resend" });
    revalidatePath("/dashboard/members");
    return { message: "Se generó un enlace nuevo, pero el correo no pudo enviarse. Copia el enlace.", invitationUrl: fallbackUrl, deliveryStatus: "failed" };
  }
}

export async function revokeClinicInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const invitationId = asString(formData.get("invitation_id"));
  if (!invitationId) return { error: "No fue posible identificar la invitación." };

  const { error } = await revokeClinicInvitation(invitationId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  return { message: "La invitación fue revocada y su enlace ya no es válido." };
}
