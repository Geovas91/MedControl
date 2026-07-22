import "server-only";

import { createTemplateSchema, getTemplateContent, validateTemplateValues, type TemplateFormValues, type TemplateKind } from "@/lib/clinical-record/templates";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type TemplateRow = Database["public"]["Tables"]["medical_note_templates"]["Row"];
type TemplateInsert = Database["public"]["Tables"]["medical_note_templates"]["Insert"];
type TemplateDetail = Pick<TemplateRow, "id" | "name" | "specialty" | "description" | "template_schema" | "template_kind" | "is_active" | "created_at" | "updated_at">;
type Result<T> = { state: "ready"; data: T } | { state: "unauthenticated" | "no_active_membership" | "forbidden" | "not_found" | "invalid_id" | "error"; data: null };

function canManageTemplates(role: Database["public"]["Enums"]["clinic_member_role"]) {
  return role === "owner" || role === "admin";
}

async function contextForTemplates(requireManage: boolean) {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return context;
  if (requireManage ? !canManageTemplates(context.tenant.membership.role) : context.tenant.membership.role === "assistant") return { state: "forbidden" as const, data: null };
  return { state: "ready" as const, data: context };
}

export async function listClinicalTemplates(kind?: TemplateKind, active?: boolean): Promise<Result<{ templates: TemplateDetail[]; canManage: boolean }>> {
  const resolved = await contextForTemplates(false);
  if (resolved.state !== "ready") return { state: resolved.state, data: null };
  const { tenant } = resolved.data;
  const supabase = await createClient();
  let query = supabase.from("medical_note_templates").select("id, name, specialty, description, template_schema, template_kind, is_active, created_at, updated_at").eq("clinic_id", tenant.clinic.id).order("updated_at", { ascending: false });
  if (kind) query = query.eq("template_kind", kind);
  if (active !== undefined) query = query.eq("is_active", active);
  const result = await query;
  if (result.error) { logger.error("Clinical template list failed", { component: "clinical_templates", operation: "list", status: "query_error", code: result.error.code }); return { state: "error", data: null }; }
  return { state: "ready", data: { templates: (result.data ?? []) as TemplateDetail[], canManage: canManageTemplates(tenant.membership.role) } };
}

export async function getClinicalTemplate(templateId: string, requireManage = false): Promise<Result<{ template: TemplateDetail; canManage: boolean }>> {
  if (!isCanonicalAppointmentUuid(templateId)) return { state: "invalid_id", data: null };
  const resolved = await contextForTemplates(requireManage);
  if (resolved.state !== "ready") return { state: resolved.state, data: null };
  const { tenant } = resolved.data;
  const supabase = await createClient();
  const result = await supabase.from("medical_note_templates").select("id, name, specialty, description, template_schema, template_kind, is_active, created_at, updated_at").eq("id", templateId).eq("clinic_id", tenant.clinic.id).maybeSingle();
  if (result.error) { logger.error("Clinical template detail failed", { component: "clinical_templates", operation: "detail", status: "query_error", code: result.error.code }); return { state: "error", data: null }; }
  if (!result.data) return { state: "not_found", data: null };
  return { state: "ready", data: { template: result.data as TemplateDetail, canManage: canManageTemplates(tenant.membership.role) } };
}

export async function createClinicalTemplate(values: TemplateFormValues) {
  const resolved = await contextForTemplates(true);
  if (resolved.state !== "ready") return { state: resolved.state, data: null };
  const validation = validateTemplateValues(values);
  if (!validation.valid) return { state: "validation_error" as const, errors: validation.errors, values };
  const { tenant, user } = resolved.data;
  const insert: TemplateInsert = { clinic_id: tenant.clinic.id, name: values.name, specialty: values.specialty || null, description: values.description || null, template_schema: createTemplateSchema(values.content, values.kind), template_kind: values.kind, is_active: values.isActive, created_by: user.id };
  const supabase = await createClient();
  const result = (await supabase.from("medical_note_templates").insert(insert as never).select("id").single()) as unknown as { data: { id: string } | null; error: { code: string } | null };
  if (result.error || !result.data) { logger.error("Clinical template create failed", { component: "clinical_templates", operation: "create", status: "insert_error", code: result.error?.code }); return { state: "error" as const, values }; }
  return { state: "success" as const, templateId: result.data.id };
}

export async function updateClinicalTemplate(templateId: string, values: TemplateFormValues) {
  if (!isCanonicalAppointmentUuid(templateId)) return { state: "invalid_id" as const };
  const resolved = await contextForTemplates(true);
  if (resolved.state !== "ready") return { state: resolved.state, data: null };
  const validation = validateTemplateValues(values);
  if (!validation.valid || !values.expectedUpdatedAt) return { state: "validation_error" as const, errors: validation.valid ? { expectedUpdatedAt: "Actualiza la pagina e intenta nuevamente." } : validation.errors, values };
  const supabase = await createClient();
  const result = await supabase.from("medical_note_templates").update({ name: values.name, specialty: values.specialty || null, description: values.description || null, template_schema: createTemplateSchema(values.content, values.kind), template_kind: values.kind, is_active: values.isActive } as never).eq("id", templateId).eq("clinic_id", resolved.data.tenant.clinic.id).eq("updated_at", values.expectedUpdatedAt).select("id").maybeSingle();
  if (result.error) { logger.error("Clinical template update failed", { component: "clinical_templates", operation: "update", status: "query_error", code: result.error.code }); return { state: "error" as const, values }; }
  if (!result.data) return { state: "stale_update" as const, values };
  return { state: "success" as const, templateId };
}

export async function setClinicalTemplateActive(templateId: string, isActive: boolean) {
  if (!isCanonicalAppointmentUuid(templateId)) return { state: "invalid_id" as const };
  const resolved = await contextForTemplates(true);
  if (resolved.state !== "ready") return { state: resolved.state, data: null };
  const supabase = await createClient();
  const result = await supabase.from("medical_note_templates").update({ is_active: isActive } as never).eq("id", templateId).eq("clinic_id", resolved.data.tenant.clinic.id).select("id").maybeSingle();
  if (result.error) { logger.error("Clinical template toggle failed", { component: "clinical_templates", operation: "toggle", status: "query_error", code: result.error.code }); return { state: "error" as const, data: null }; }
  return result.data ? { state: "success" as const } : { state: "stale_update" as const };
}

export async function duplicateClinicalTemplate(templateId: string) {
  const detail = await getClinicalTemplate(templateId, true);
  if (detail.state !== "ready") return detail;
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  const source = detail.data.template;
  const insert: TemplateInsert = { clinic_id: context.tenant.clinic.id, name: `${source.name} Copia`, specialty: source.specialty, description: source.description, template_schema: source.template_schema, template_kind: source.template_kind, is_active: false, created_by: context.user.id };
  const supabase = await createClient();
  const result = (await supabase.from("medical_note_templates").insert(insert as never).select("id").single()) as unknown as { data: { id: string } | null; error: { code: string } | null };
  if (result.error || !result.data) { logger.error("Clinical template duplicate failed", { component: "clinical_templates", operation: "duplicate", status: "insert_error", code: result.error?.code }); return { state: "error" as const, data: null }; }
  return { state: "success" as const, templateId: result.data.id };
}

export function getClinicalTemplateContent(template: TemplateDetail) {
  return getTemplateContent(template.template_schema);
}
