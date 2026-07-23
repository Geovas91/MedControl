"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { acceptPublicMemberInvitation } from "@/lib/server/member-invitations";

export async function acceptInvitationAction(token: string) {
  const { data: clinicId, error } = await acceptPublicMemberInvitation(token);
  if (error || !clinicId) redirect(`/invite/${token}?error=1`);
  (await cookies()).set("clinicontrol_active_clinic", clinicId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  redirect("/dashboard");
}
