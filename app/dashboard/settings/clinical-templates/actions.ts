"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getTemplateFormValues } from "@/lib/clinical-record/templates";
import { createClinicalTemplate, duplicateClinicalTemplate, setClinicalTemplateActive, updateClinicalTemplate } from "@/lib/server/clinical-templates";

function revalidateTemplates() {
  revalidatePath("/dashboard/settings/clinical-templates");
  revalidatePath("/dashboard/patients");
}

export async function createClinicalTemplateAction(_state: Record<string, unknown>, formData: FormData) {
  const result = await createClinicalTemplate(getTemplateFormValues(formData));
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") return { error: "No fue posible guardar la plantilla.", errors: "errors" in result ? result.errors : undefined, values: "values" in result ? result.values : undefined };
  revalidateTemplates();
  redirect(`/dashboard/settings/clinical-templates/${result.templateId}?template_created=1`);
}

export async function updateClinicalTemplateAction(templateId: string, _state: Record<string, unknown>, formData: FormData) {
  const result = await updateClinicalTemplate(templateId, getTemplateFormValues(formData));
  if (result.state === "invalid_id") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") return { error: result.state === "stale_update" ? "La plantilla cambio en otra sesion. Actualiza la pagina e intenta nuevamente." : "No fue posible actualizar la plantilla.", errors: "errors" in result ? result.errors : undefined, values: "values" in result ? result.values : undefined };
  revalidateTemplates();
  redirect(`/dashboard/settings/clinical-templates/${templateId}?template_updated=1`);
}

export async function toggleClinicalTemplateAction(templateId: string, isActive: boolean) {
  const result = await setClinicalTemplateActive(templateId, isActive);
  if (result.state === "invalid_id") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "success") return;
  revalidateTemplates();
  redirect(`/dashboard/settings/clinical-templates/${templateId}?${isActive ? "template_activated" : "template_deactivated"}=1`);
}

export async function duplicateClinicalTemplateAction(templateId: string) {
  const result = await duplicateClinicalTemplate(templateId);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "success") return;
  revalidateTemplates();
  redirect(`/dashboard/settings/clinical-templates/${result.templateId}?template_duplicated=1`);
}
