import type { Database } from "@/types/database";

type ClinicMemberRole = Database["public"]["Enums"]["clinic_member_role"];

const clinicalRoles = ["owner", "admin", "doctor"] as const;

export function canViewClinicalRecord(role: ClinicMemberRole) {
  return clinicalRoles.includes(role as (typeof clinicalRoles)[number]);
}

export const canCreateClinicalNote = canViewClinicalRecord;
export const canCreateConsent = canViewClinicalRecord;
export const canUseClinicalTemplate = canViewClinicalRecord;

export function canEditClinicalNote({
  role,
  authorId,
  currentUserId,
  status
}: {
  role: ClinicMemberRole;
  authorId: string | null;
  currentUserId: string;
  status: Database["public"]["Enums"]["medical_note_status"];
}) {
  if (status !== "draft" || !canViewClinicalRecord(role)) return false;
  if (role === "doctor") return authorId === currentUserId;
  return role === "owner" || role === "admin";
}
