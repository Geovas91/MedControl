"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function switchActiveClinicAction(formData: FormData) {
  const submittedClinicId = formData.get("clinic_id");
  const clinicId = typeof submittedClinicId === "string" ? submittedClinicId : "";
  if (!clinicId) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: membership } = await supabase
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) return;
  (await cookies()).set("clinicontrol_active_clinic", clinicId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  revalidatePath("/dashboard", "layout");
}
