import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createConsentAction } from "@/app/dashboard/patients/[id]/consents/new/actions";
import { PatientConsentForm } from "@/components/clinical-record/consent-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getConsentTemplateOptions } from "@/lib/server/clinical-consents";

export const dynamic = "force-dynamic";
export default async function NewPatientConsentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const result = await getConsentTemplateOptions(id); if (result.state === "invalid_id" || result.state === "not_found") notFound(); if (result.state === "unauthenticated") redirect("/login"); if (result.state !== "ready") return <p className="text-sm text-slate-600">No tienes permiso para crear consentimientos.</p>; return <><Link href={`/dashboard/patients/${id}/consents`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a consentimientos</Link><PageHeader title="Nuevo consentimiento" description={`Crea un documento pendiente para ${result.data.patient.full_name}.`} /><PatientConsentForm action={createConsentAction.bind(null, id)} cancelHref={`/dashboard/patients/${id}/consents`} templates={result.data.templates} /></>; }
