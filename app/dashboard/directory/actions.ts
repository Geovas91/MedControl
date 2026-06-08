"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/lib/onboarding";
import {
  createOrUpdateDoctorPublicProfile,
  isConsultationMode,
  sanitizePublicUrl,
  splitPublicList
} from "@/lib/server/directory";
import { listClinicMembersForClinic } from "@/lib/supabase/clinic-members";

type DirectoryProfileFormState = {
  error?: string;
  message?: string;
};

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: FormDataEntryValue | null) {
  const text = asString(value);
  return text || null;
}

function asBoolean(value: FormDataEntryValue | null) {
  return value === "on";
}

function parseYearsExperience(value: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function canEditDirectoryMember(currentRole: string, currentMemberId: string, targetMemberId: string) {
  if (currentRole === "owner" || currentRole === "admin") {
    return true;
  }

  return currentMemberId === targetMemberId && (currentRole === "doctor" || currentRole === "owner");
}

export async function saveDirectoryProfileAction(
  _previousState: DirectoryProfileFormState,
  formData: FormData
): Promise<DirectoryProfileFormState> {
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  const targetClinicMemberId = asString(formData.get("clinic_member_id")) || onboardingStatus.membership.id;
  const displayName = asString(formData.get("display_name"));
  const specialty = nullableString(formData.get("specialty"));
  const consultationModeValue = asString(formData.get("consultation_mode"));
  const isPublished = asBoolean(formData.get("is_published"));
  const yearsExperience = parseYearsExperience(asString(formData.get("years_experience")));
  const websiteUrl = nullableString(formData.get("website_url"));

  if (!displayName) {
    return { error: "El nombre visible es obligatorio." };
  }

  if (isPublished && !specialty) {
    return { error: "Para publicar el perfil agrega una especialidad." };
  }

  if (!isConsultationMode(consultationModeValue)) {
    return { error: "Selecciona una modalidad de consulta válida." };
  }

  if (Number.isNaN(yearsExperience)) {
    return { error: "Los años de experiencia deben ser un número entero mayor o igual a 0." };
  }

  const sanitizedWebsiteUrl = sanitizePublicUrl(websiteUrl);

  if (websiteUrl && !sanitizedWebsiteUrl) {
    return { error: "La URL pública debe iniciar con http:// o https://." };
  }

  if (
    !canEditDirectoryMember(
      onboardingStatus.membership.role,
      onboardingStatus.membership.id,
      targetClinicMemberId
    )
  ) {
    return { error: "No tienes permiso para editar ese perfil público." };
  }

  const { data: clinicMembers, error: membersError } = await listClinicMembersForClinic(onboardingStatus.membership.clinic_id);

  if (membersError) {
    return { error: membersError.message };
  }

  const targetMember = clinicMembers?.find((member) => member.id === targetClinicMemberId);

  if (!targetMember) {
    return { error: "El miembro seleccionado no pertenece a tu clínica." };
  }

  if (targetMember.role !== "owner" && targetMember.role !== "doctor") {
    return { error: "Solo se pueden publicar perfiles de médicos o propietarios clínicos." };
  }

  const { data, error } = await createOrUpdateDoctorPublicProfile({
    clinicId: onboardingStatus.membership.clinic_id,
    profileId: targetMember.user_id,
    clinicMemberId: targetMember.id,
    displayName,
    professionalTitle: nullableString(formData.get("professional_title")),
    specialty,
    subspecialty: nullableString(formData.get("subspecialty")),
    professionalLicense: nullableString(formData.get("professional_license")),
    specialtyLicense: nullableString(formData.get("specialty_license")),
    bio: nullableString(formData.get("bio")),
    yearsExperience,
    languages: splitPublicList(asString(formData.get("languages"))),
    services: splitPublicList(asString(formData.get("services"))),
    consultationMode: consultationModeValue,
    addressLine: nullableString(formData.get("address_line")),
    city: nullableString(formData.get("city")),
    state: nullableString(formData.get("state")),
    phone: nullableString(formData.get("phone")),
    whatsapp: nullableString(formData.get("whatsapp")),
    publicEmail: nullableString(formData.get("public_email")),
    websiteUrl: sanitizedWebsiteUrl,
    profileImageUrl: null,
    isPublished,
    acceptsNewPatients: asBoolean(formData.get("accepts_new_patients"))
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/directory");
  revalidatePath("/directorio");

  if (data?.slug) {
    revalidatePath(`/directorio/${data.slug}`);
  }

  return { message: isPublished ? "Perfil público guardado y publicado." : "Perfil público guardado como borrador." };
}
