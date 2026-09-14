import type { Database } from "@/types/database";

export type ClinicalPermissionMembership = Pick<
  Database["public"]["Tables"]["clinic_members"]["Row"],
  "role" | "is_professional"
>;

export function canViewClinicalRecord(membership: ClinicalPermissionMembership) {
  return membership.is_professional && membership.role !== "assistant";
}

export const canCreateClinicalNote = canViewClinicalRecord;
export const canCreateConsent = canViewClinicalRecord;
export const canUseClinicalTemplate = canViewClinicalRecord;
export const canFinalizeClinicalNote = canViewClinicalRecord;

export function canViewPatientAudit(membership: ClinicalPermissionMembership) {
  return membership.role === "owner" || membership.role === "admin";
}

export function canEditClinicalNote({
  membership,
  authorId,
  currentUserId,
  status
}: {
  membership: ClinicalPermissionMembership;
  authorId: string | null;
  currentUserId: string;
  status: Database["public"]["Enums"]["medical_note_status"];
}) {
  if (status !== "draft" || !canViewClinicalRecord(membership)) return false;
  if (membership.role === "doctor") return authorId === currentUserId;
  return membership.role === "owner" || membership.role === "admin";
}
