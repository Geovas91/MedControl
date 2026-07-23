"use server";

import { redirect } from "next/navigation";
import { acceptPublicMemberInvitation } from "@/lib/server/member-invitations";

export async function acceptInvitationAction(token: string) {
  const { error } = await acceptPublicMemberInvitation(token);
  if (error) redirect(`/invite/${token}?error=1`);
  redirect("/dashboard");
}
