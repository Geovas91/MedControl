import "server-only";

import { hashInvitationToken } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";

type PublicInvitation = { is_valid: boolean; clinic_name: string | null; invited_role: string | null; masked_email: string | null; expires_at: string | null };

export async function getPublicMemberInvitation(token: string) {
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc(fn: string, args: Record<string, string>): Promise<{ data: PublicInvitation[] | null; error: { code: string } | null }> }).rpc("get_public_clinic_member_invitation", { p_token_hash: hashInvitationToken(token) });
  if (error || !data?.[0]?.is_valid) return null;
  return data[0];
}

export async function acceptPublicMemberInvitation(token: string) {
  const supabase = await createClient();
  return (supabase as unknown as { rpc(fn: string, args: Record<string, string>): Promise<{ data: boolean | null; error: { message: string } | null }> }).rpc("accept_clinic_member_invitation_for_current_user", { p_token_hash: hashInvitationToken(token) });
}
