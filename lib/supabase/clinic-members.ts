import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { PostgrestError } from "@supabase/supabase-js";

export type ClinicMemberRole = Database["public"]["Enums"]["clinic_member_role"];
export type ManagedClinicMember = {
  id: string;
  clinic_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: ClinicMemberRole;
  status: Database["public"]["Enums"]["clinic_member_status"];
  created_at: string;
};
export type ManagedClinicInvitation = { id: string; invited_email: string; role: Exclude<ClinicMemberRole, "owner">; status: "pending" | "accepted" | "revoked" | "expired"; expires_at: string; created_at: string; last_rotated_at: string | null; rotation_count: number };
export type InvitationTokenResult = { invitation_id: string; raw_token: string; expires_at: string; invited_email: string; invited_role: Exclude<ClinicMemberRole, "owner"> };

type ClinicMembersRpcClient = {
  rpc(
    fn: "list_clinic_members_for_current_user",
    args: { target_clinic_id: string }
  ): Promise<{ data: ManagedClinicMember[] | null; error: PostgrestError | null }>;
  rpc(
    fn: "add_clinic_member_by_email_for_current_user",
    args: { target_clinic_id: string; member_email: string; member_role: Exclude<ClinicMemberRole, "owner"> }
  ): Promise<{ data: string | null; error: PostgrestError | null }>;
  rpc(fn: "create_clinic_member_invitation_for_current_user", args: { p_clinic_id: string; p_email: string; p_role: Exclude<ClinicMemberRole, "owner"> }): Promise<{ data: InvitationTokenResult[] | null; error: PostgrestError | null }>;
  rpc(fn: "list_clinic_member_invitations_for_current_user", args: { p_clinic_id: string }): Promise<{ data: ManagedClinicInvitation[] | null; error: PostgrestError | null }>;
  rpc(fn: "rotate_clinic_member_invitation_token_for_current_user", args: { p_invitation_id: string }): Promise<{ data: { raw_token: string; expires_at: string }[] | null; error: PostgrestError | null }>;
  rpc(fn: "revoke_clinic_member_invitation_for_current_user", args: { p_invitation_id: string }): Promise<{ data: boolean | null; error: PostgrestError | null }>;
};

export type AddClinicMemberByEmailInput = {
  clinicId: string;
  email: string;
  role: Exclude<ClinicMemberRole, "owner">;
};

export async function listClinicMembersForClinic(clinicId: string) {
  const supabase = await createClient();
  const clinicMembersClient = supabase as unknown as ClinicMembersRpcClient;

  return clinicMembersClient.rpc("list_clinic_members_for_current_user", {
    target_clinic_id: clinicId
  });
}

export async function addClinicMemberByEmailToClinic({ clinicId, email, role }: AddClinicMemberByEmailInput) {
  const supabase = await createClient();
  const clinicMembersClient = supabase as unknown as ClinicMembersRpcClient;

  return clinicMembersClient.rpc("add_clinic_member_by_email_for_current_user", {
    target_clinic_id: clinicId,
    member_email: email,
    member_role: role
  });
}

export async function createClinicInvitation(clinicId: string, email: string, role: Exclude<ClinicMemberRole, "owner">) {
  const supabase = await createClient();
  return (supabase as unknown as ClinicMembersRpcClient).rpc("create_clinic_member_invitation_for_current_user", { p_clinic_id: clinicId, p_email: email, p_role: role });
}
export async function listClinicInvitations(clinicId: string) { const supabase = await createClient(); return (supabase as unknown as ClinicMembersRpcClient).rpc("list_clinic_member_invitations_for_current_user", { p_clinic_id: clinicId }); }
export async function rotateClinicInvitation(invitationId: string) { const supabase = await createClient(); return (supabase as unknown as ClinicMembersRpcClient).rpc("rotate_clinic_member_invitation_token_for_current_user", { p_invitation_id: invitationId }); }
export async function revokeClinicInvitation(invitationId: string) { const supabase = await createClient(); return (supabase as unknown as ClinicMembersRpcClient).rpc("revoke_clinic_member_invitation_for_current_user", { p_invitation_id: invitationId }); }
