"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import {
  createClinicInvitation,
  revokeClinicInvitation,
  rotateClinicInvitation,
  type ClinicMemberRole
} from "@/lib/supabase/clinic-members";
import { getAppBaseUrl } from "@/lib/supabase/config";

export type InvitationActionState = {
  error?: string;
  message?: string;
  invitationUrl?: string;
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
  revalidatePath("/dashboard/members");

  return { message: "Invitación creada. El correo no se envió porque no hay un proveedor configurado.", invitationUrl: new URL(`/invite/${invitation.raw_token}`, getAppBaseUrl()).toString() };
}

export async function rotateClinicInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const invitationId = asString(formData.get("invitation_id"));
  if (!invitationId) return { error: "No fue posible identificar la invitación." };

  const { data, error } = await rotateClinicInvitation(invitationId);
  if (error || !data?.[0]) return { error: error?.message ?? "No fue posible rotar el enlace." };

  revalidatePath("/dashboard/members");
  return {
    message: "Se generó un enlace nuevo. El enlace anterior dejó de ser válido.",
    invitationUrl: new URL(`/invite/${data[0].raw_token}`, getAppBaseUrl()).toString()
  };
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
