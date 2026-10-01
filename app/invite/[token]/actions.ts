"use server";

import { redirect } from "next/navigation";
import { acceptPublicMemberInvitation } from "@/lib/server/member-invitations";

export async function acceptInvitationAction(token: string) {
  const { data: clinicId, error } = await acceptPublicMemberInvitation(token);
  if (error || !clinicId) redirect(`/invite/${token}?error=1`);
  redirect("/dashboard");
}
