import { Download, Eye, FileSignature, Plus, RefreshCw } from "lucide-react";
import { generateConsentDocumentAction } from "@/app/dashboard/patients/[id]/consents/[consentId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { canCreateConsent } from "@/lib/clinical-record/permissions";
import { formatPatientTimestamp, getConsentStatusLabel } from "@/lib/patients/detail";
import type { ClinicalRecordData } from "@/lib/server/clinical-record";

function statusVariant(status: string) {
  return status === "signed" ? "green" as const : status === "pending" ? "amber" as const : "slate" as const;
}

export function PatientDocumentsTab({ data }: { data: ClinicalRecordData }) {
  const patientId = data.patient.id;
  const timeZone = data.tenant.clinic.timezone;
  return <section className="surface-card p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5 text-clinic" />Documentos clínicos</h2><p className="mt-1 text-sm text-slate-500">CliniControl conserva actualmente consentimientos y sus PDF firmados. No se muestran tipos de documento ficticios.</p></div>{canCreateConsent(data.tenant.membership.role) ? <ButtonLink href={`/dashboard/patients/${patientId}/consents/new`}><Plus className="h-4 w-4" />Nuevo consentimiento</ButtonLink> : null}</div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      {data.consents.length ? data.consents.map((consent) => <article key={consent.id} className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-ink">{consent.consent_type}</h3><p className="mt-1 text-sm text-slate-500">Consentimiento · Versión {consent.consent_version}</p></div><Badge variant={statusVariant(consent.status)}>{getConsentStatusLabel(consent.status)}</Badge></div>
        <dl className="mt-3 grid gap-1 text-sm text-slate-600"><div><dt className="inline font-semibold">Fecha: </dt><dd className="inline">{formatPatientTimestamp(consent.signed_at ?? consent.created_at, timeZone)}</dd></div>{consent.signedBy ? <div><dt className="inline font-semibold">Firmado por: </dt><dd className="inline">{consent.signedBy}</dd></div> : null}{consent.status === "signed" ? <div><dt className="inline font-semibold">PDF: </dt><dd className="inline">{consent.documentStatus === "ready" ? "Disponible" : consent.documentStatus === "failed" ? "Falló la generación" : "Pendiente de generación"}</dd></div> : null}</dl>
        <div className="mt-4 flex flex-wrap gap-2"><ButtonLink href={`/dashboard/patients/${patientId}/consents/${consent.id}`} variant="secondary" className="min-h-10 px-3"><Eye className="h-4 w-4" />Abrir</ButtonLink>{consent.status === "signed" && consent.documentStatus === "ready" ? <ButtonLink href={`/api/consents/${consent.id}/document`} className="min-h-10 px-3"><Download className="h-4 w-4" />Descargar PDF</ButtonLink> : null}{consent.status === "signed" && consent.documentStatus !== "ready" ? <form action={generateConsentDocumentAction.bind(null, patientId, consent.id)}><Button type="submit" className="min-h-10 px-3"><RefreshCw className="h-4 w-4" />{consent.documentStatus === "failed" ? "Reintentar PDF" : "Generar PDF"}</Button></form> : null}</div>
      </article>) : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500 md:col-span-2">No hay documentos clínicos registrados.</p>}
    </div>
  </section>;
}
