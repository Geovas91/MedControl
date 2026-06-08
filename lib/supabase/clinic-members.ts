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

type ClinicMembersRpcClient = {
  rpc(
    fn: "list_clinic_members_for_current_user",
    args: { target_clinic_id: string }
  ): Promise<{ data: ManagedClinicMember[] | null; error: PostgrestError | null }>;
  rpc(
    fn: "add_clinic_member_by_email_for_current_user",
    args: { target_clinic_id: string; member_email: string; member_role: Exclude<ClinicMemberRole, "owner"> }
  ): Promise<{ data: string | null; error: PostgrestError | null }>;
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
