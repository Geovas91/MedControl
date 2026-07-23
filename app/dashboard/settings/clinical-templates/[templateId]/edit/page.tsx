import { notFound, redirect } from "next/navigation";
import { updateClinicalTemplateAction } from "@/app/dashboard/settings/clinical-templates/actions";
import { ClinicalTemplateForm } from "@/components/clinical-record/clinical-template-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getClinicalTemplate, getClinicalTemplateContent } from "@/lib/server/clinical-templates";

export const dynamic = "force-dynamic";
export default async function EditClinicalTemplatePage({ params }: { params: Promise<{ templateId: string }> }) { const { templateId } = await params; const result = await getClinicalTemplate(templateId, true); if (result.state === "invalid_id" || result.state === "not_found") notFound(); if (result.state === "unauthenticated") redirect("/login"); if (result.state !== "ready" || result.data.template.is_system_template) return <p className="text-sm text-slate-600">No tienes permiso para editar esta plantilla.</p>; const template = result.data.template; return <><PageHeader title="Editar plantilla" description="Los registros ya creados conservan su contenido historico." /><ClinicalTemplateForm action={updateClinicalTemplateAction.bind(null, templateId)} initialValues={{ name: template.name, specialty: template.specialty ?? "", description: template.description ?? "", content: getClinicalTemplateContent(template), kind: template.template_kind, isActive: template.is_active, expectedUpdatedAt: template.updated_at }} cancelHref={`/dashboard/settings/clinical-templates/${templateId}`} /></>; }
