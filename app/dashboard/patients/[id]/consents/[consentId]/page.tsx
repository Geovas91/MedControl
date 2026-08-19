import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, FileSignature, RefreshCw } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { cancelConsentAction, generateConsentDocumentAction, generateConsentSigningLinkAction, revokeConsentSigningLinkAction, sendConsentEmailAction } from "@/app/dashboard/patients/[id]/consents/[consentId]/actions";
import { ConsentSigningLinkControls } from "@/components/clinical-record/consent-signing-link-controls";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatPatientTimestamp, getConsentStatusLabel } from "@/lib/patients/detail";
import { getConsentForActiveTenant } from "@/lib/server/clinical-consents";
import { getSignedConsentEvidenceForActiveTenant } from "@/lib/server/consent-documents";

export const dynamic = "force-dynamic";

type Query = {
  consent_created?: string | string[];
  consent_cancelled?: string | string[];
  cancellation_error?: string | string[];
  pdf_ready?: string | string[];
  pdf_error?: string | string[];
};

export default async function ConsentDetailPage({ params, searchParams }: { params: Promise<{ id: string; consentId: string }>; searchParams: Promise<Query> }) {
  const { id, consentId } = await params;
  const [result, query] = await Promise.all([getConsentForActiveTenant(id, consentId), searchParams]);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes acceso a este consentimiento.</section>;

  const consent = result.data;
  const evidenceResult = consent.status === "signed" ? await getSignedConsentEvidenceForActiveTenant(id, consentId) : null;
  const evidence = evidenceResult?.state === "ready" ? evidenceResult.data : null;
  return (
    <>
      <Link href={`/dashboard/patients/${id}/consents`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a consentimientos</Link>
      {query.consent_created === "1" ? <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El consentimiento se creó correctamente.</p> : null}
      {query.consent_cancelled === "1" ? <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El consentimiento se canceló y ya no puede firmarse.</p> : null}
      {query.pdf_ready === "1" ? <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El PDF privado está listo y verificado.</p> : null}
      {query.cancellation_error === "1" || query.pdf_error === "1" ? <p role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">No fue posible completar la acción. La firma clínica permanece intacta.</p> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <Badge variant={consent.status === "signed" ? "green" : consent.status === "pending" ? "amber" : "slate"}>{getConsentStatusLabel(consent.status)}</Badge>
        <h1 className="mt-4 text-2xl font-bold text-ink">{consent.consent_type}</h1>
        <p className="mt-2 text-sm text-slate-500">Versión {consent.consent_version}</p>
        <section className="mt-6"><h2 className="font-bold text-ink">Texto firmado</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{consent.consent_text}</p></section>
        {consent.status === "cancelled" ? <section className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4"><h2 className="font-bold text-ink">Cancelación</h2><p className="mt-2 text-sm text-slate-600">{formatPatientTimestamp(consent.cancelled_at, consent.timeZone)}</p>{consent.cancellation_reason ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{consent.cancellation_reason}</p> : null}</section> : null}
        {consent.status === "signed" && evidence ? (
          <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
            <div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-clinic" /><h2 className="font-bold text-ink">Evidencia firmada</h2></div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-500">Paciente</dt><dd className="mt-1 text-ink">{evidence.patient_display_name}</dd></div>
              <div><dt className="font-semibold text-slate-500">Firmante</dt><dd className="mt-1 text-ink">{evidence.signer_full_name}</dd></div>
              <div><dt className="font-semibold text-slate-500">Fecha de firma</dt><dd className="mt-1 text-ink">{formatPatientTimestamp(evidence.signed_at, consent.timeZone)}</dd></div>
              <div><dt className="font-semibold text-slate-500">Estado</dt><dd className="mt-1 font-semibold text-emerald-700">Firmado</dd></div>
            </dl>
            <ul className="mt-4 grid gap-2 text-sm text-slate-700"><li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Aviso de privacidad: {evidence.accepted_privacy_notice ? "Aceptado" : "No aceptado"}</li><li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Tratamiento de datos sensibles: {evidence.accepted_sensitive_data_processing ? "Aceptado" : "No aceptado"}</li></ul>
            <div className="mt-5"><h3 className="font-semibold text-ink">Firma gráfica</h3><div className="mt-2 inline-flex min-h-32 items-center rounded-md border border-slate-200 bg-white p-3"><Image src={`/api/consents/${consentId}/signature`} alt={`Firma de ${evidence.signer_full_name}`} width={480} height={220} unoptimized className="h-auto max-h-48 w-auto max-w-full" /></div></div>
          </section>
        ) : null}
        {consent.status === "signed" ? (
          <section className="mt-6 rounded-md border border-slate-200 p-4">
            <h2 className="font-bold text-ink">Documento PDF</h2>
            <p className="mt-2 text-sm text-slate-600">{evidence?.document_status === "ready" ? "Disponible en Storage privado y protegido con verificación SHA-256 al descargar." : evidence?.document_status === "failed" ? "La última generación falló. Puedes reintentar sin modificar la firma." : "Pendiente de generación."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {evidence?.document_status === "ready" ? <ButtonLink href={`/api/consents/${consentId}/document`}><Download className="h-4 w-4" />Descargar PDF</ButtonLink> : <form action={generateConsentDocumentAction.bind(null, id, consentId)}><Button type="submit"><RefreshCw className="h-4 w-4" />{evidence?.document_status === "failed" ? "Reintentar PDF" : "Generar PDF"}</Button></form>}
            </div>
          </section>
        ) : null}
        {consent.status === "pending" ? <ConsentSigningLinkControls action={generateConsentSigningLinkAction.bind(null, id, consentId)} emailAction={sendConsentEmailAction.bind(null, id, consentId)} revokeAction={revokeConsentSigningLinkAction.bind(null, id, consentId)} cancelAction={cancelConsentAction.bind(null, id, consentId)} patientEmail={consent.patientEmail} signingTokenExpiresAt={consent.signing_token_expires_at} signingTokenUsedAt={consent.signing_token_used_at} signingTokenRevokedAt={consent.signing_token_revoked_at} hasActiveLink={Boolean(consent.signing_token_expires_at && !consent.signing_token_revoked_at && !consent.signing_token_used_at && new Date(consent.signing_token_expires_at) > new Date())} /> : null}
      </section>
    </>
  );
}
