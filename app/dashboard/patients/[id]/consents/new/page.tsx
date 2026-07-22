import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PatientConsentForm } from "@/components/clinical-record/consent-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { createConsentAction } from "@/app/dashboard/patients/[id]/consents/new/actions";
import { getClinicalRecordForActiveTenant } from "@/lib/server/clinical-record";
import { canCreateConsent } from "@/lib/clinical-record/permissions";

export const dynamic = "force-dynamic";
export default async function NewConsentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const result = await getClinicalRecordForActiveTenant(id, {}); if (result.state === "invalid_id" || result.state === "not_found") notFound(); if (result.state === "unauthenticated") redirect("/login"); if (result.state !== "ready" || !canCreateConsent(result.data.tenant.membership.role)) return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes permiso para crear consentimientos.</section>; return <><Link href={`/dashboard/patients/${id}/consents`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a consentimientos</Link><PageHeader title="Nuevo consentimiento" description={`Crea un consentimiento pendiente para ${result.data.patient.full_name}.`} /><PatientConsentForm action={createConsentAction.bind(null, id)} cancelHref={`/dashboard/patients/${id}/consents`} /></>; }
