import Link from "next/link";
import { ArrowLeft, Download, Eye, FileSignature, Plus, RefreshCw } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { generateConsentDocumentAction } from "@/app/dashboard/patients/[id]/consents/[consentId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { canCreateConsent } from "@/lib/clinical-record/permissions";
import { formatPatientTimestamp, getConsentStatusLabel } from "@/lib/patients/detail";
import { getClinicalRecordForActiveTenant } from "@/lib/server/clinical-record";

export const dynamic = "force-dynamic";

function statusVariant(status: string) {
  return status === "signed" ? "green" as const : status === "pending" ? "amber" as const : "slate" as const;
}

export default async function PatientConsentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getClinicalRecordForActiveTenant(id, {});
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes acceso a consentimientos clínicos.</section>;
  const { data } = result;

  return (
    <>
      <Link href={`/dashboard/patients/${id}/clinical-record`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver al expediente</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-ink">Consentimientos</h1><p className="mt-1 text-sm text-slate-500">Histórico documental de {data.patient.full_name}, del más reciente al más antiguo.</p></div>
        {canCreateConsent(data.tenant.membership.role) ? <ButtonLink href={`/dashboard/patients/${id}/consents/new`}><Plus className="h-4 w-4" />Nuevo consentimiento</ButtonLink> : null}
      </div>
      <div className="grid gap-3">
        {data.consents.length ? data.consents.map((consent) => (
          <article key={consent.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-clinic" /><h2 className="font-semibold text-ink">{consent.consent_type}</h2></div>
                <p className="mt-1 text-sm text-slate-500">Versión {consent.consent_version} · Creado {formatPatientTimestamp(consent.created_at, data.tenant.clinic.timezone)}</p>
                {consent.signed_at ? <p className="mt-1 text-sm text-slate-600">Firmado {formatPatientTimestamp(consent.signed_at, data.tenant.clinic.timezone)}{consent.signedBy ? ` por ${consent.signedBy}` : ""}</p> : null}
                {consent.status === "signed" ? <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">PDF: {consent.documentStatus === "ready" ? "Disponible" : consent.documentStatus === "failed" ? "Falló la generación" : "Pendiente"}</p> : null}
              </div>
              <Badge variant={statusVariant(consent.status)}>{getConsentStatusLabel(consent.status)}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href={`/dashboard/patients/${id}/consents/${consent.id}`} variant="secondary" className="min-h-10 px-3"><Eye className="h-4 w-4" />Ver consentimiento</ButtonLink>
              {consent.status === "signed" && consent.documentStatus === "ready" ? <ButtonLink href={`/api/consents/${consent.id}/document`} className="min-h-10 px-3"><Download className="h-4 w-4" />Descargar PDF</ButtonLink> : null}
              {consent.status === "signed" && consent.documentStatus !== "ready" ? <form action={generateConsentDocumentAction.bind(null, id, consent.id)}><Button type="submit" className="min-h-10 px-3"><RefreshCw className="h-4 w-4" />{consent.documentStatus === "failed" ? "Reintentar PDF" : "Generar PDF"}</Button></form> : null}
            </div>
          </article>
        )) : <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No hay consentimientos registrados.</p>}
      </div>
    </>
  );
}
