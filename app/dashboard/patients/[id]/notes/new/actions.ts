"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getClinicalNoteFormValues } from "@/lib/clinical-record/notes";
import { createClinicalNoteForActiveTenant } from "@/lib/server/clinical-notes";

export async function createClinicalNoteAction(patientId: string, _state: Record<string, unknown>, formData: FormData) {
  const values = getClinicalNoteFormValues(formData);
  const result = await createClinicalNoteForActiveTenant(patientId, values);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") return { error: "error" in result ? result.error : "No tienes permiso para crear notas clínicas.", errors: "errors" in result ? result.errors : undefined, values };
  revalidatePath("/dashboard"); revalidatePath(`/dashboard/patients/${result.patientId}`); revalidatePath(`/dashboard/patients/${result.patientId}/clinical-record`); revalidatePath(`/dashboard/patients/${result.patientId}/notes/${result.noteId}`);
  redirect(`/dashboard/patients/${result.patientId}/notes/${result.noteId}?note_created=1`);
}
