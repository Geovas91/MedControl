import { redirect } from "next/navigation";
import { createClinicalTemplateAction } from "@/app/dashboard/settings/clinical-templates/actions";
import { ClinicalTemplateForm } from "@/components/clinical-record/clinical-template-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { listClinicalTemplates } from "@/lib/server/clinical-templates";

export const dynamic = "force-dynamic";
export default async function NewClinicalTemplatePage() { const access = await listClinicalTemplates(); if (access.state === "unauthenticated") redirect("/login"); if (access.state !== "ready" || !access.data.canManage) return <p className="text-sm text-slate-600">No tienes permiso para administrar plantillas.</p>; return <><PageHeader title="Nueva plantilla" description="El contenido se conserva como texto seguro y no interpreta HTML." /><ClinicalTemplateForm action={createClinicalTemplateAction} initialValues={{ name: "", specialty: "", description: "", content: "", kind: "note", isActive: true, expectedUpdatedAt: "" }} cancelHref="/dashboard/settings/clinical-templates" /></>; }
