"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { finalizeClinicalNoteForActiveTenant } from "@/lib/server/clinical-notes";

export async function finalizeClinicalNoteAction(patientId: string, noteId: string, _state: Record<string, unknown>, formData: FormData) {
  const expectedUpdatedAt = typeof formData.get("expected_updated_at") === "string" ? String(formData.get("expected_updated_at")) : "";
  const expectedStatus = typeof formData.get("expected_status") === "string" ? String(formData.get("expected_status")) : "";
  const result = await finalizeClinicalNoteForActiveTenant(patientId, noteId, { expectedUpdatedAt, expectedStatus });
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") return { error: "error" in result ? result.error : "No tienes permiso para finalizar esta nota." };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/patients/${result.patientId}`);
  revalidatePath(`/dashboard/patients/${result.patientId}/clinical-record`);
  revalidatePath(`/dashboard/patients/${result.patientId}/notes/${result.noteId}`);
  redirect(`/dashboard/patients/${result.patientId}/notes/${result.noteId}?note_finalized=1`);
}
