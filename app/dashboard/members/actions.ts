"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/lib/onboarding";
import { addClinicMemberByEmailToClinic, type ClinicMemberRole } from "@/lib/supabase/clinic-members";

type AddMemberFormState = {
  error?: string;
  message?: string;
};

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isSupportedRole(role: string): role is Exclude<ClinicMemberRole, "owner"> {
  return role === "doctor" || role === "admin" || role === "assistant";
}

export async function addClinicMemberAction(
  _previousState: AddMemberFormState,
  formData: FormData
): Promise<AddMemberFormState> {
  const fullName = asString(formData.get("full_name"));
  const email = asString(formData.get("email")).toLowerCase();
  const role = asString(formData.get("role"));
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  if (!fullName || !email || !role) {
    return { error: "Completa nombre, correo y rol para agregar un miembro." };
  }

  if (!isSupportedRole(role)) {
    return { error: "Selecciona un rol válido para el miembro." };
  }

  const { error } = await addClinicMemberByEmailToClinic({
    clinicId: onboardingStatus.membership.clinic_id,
    email,
    role
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/members");

  return { message: "Miembro agregado a la clínica." };
}
