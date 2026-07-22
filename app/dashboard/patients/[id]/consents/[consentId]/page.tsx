import Link from "next/link";
import { ArrowLeft, FileSignature } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatPatientTimestamp, getConsentStatusLabel } from "@/lib/patients/detail";
import { getConsentForActiveTenant } from "@/lib/server/clinical-consents";

export const dynamic = "force-dynamic";

export default async function ConsentDetailPage({ params, searchParams }: { params: Promise<{ id: string; consentId: string }>; searchParams: Promise<{ consent_created?: string | string[] }> }) {
  const { id, consentId } = await params;
  const [result, query] = await Promise.all([getConsentForActiveTenant(id, consentId), searchParams]);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes acceso a este consentimiento.</section>;

  const consent = result.data;
  return (
    <>
      <Link href={`/dashboard/patients/${id}/consents`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a consentimientos</Link>
      {query.consent_created === "1" ? <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El consentimiento se creo correctamente.</p> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <Badge variant={consent.status === "signed" ? "green" : consent.status === "pending" ? "amber" : "slate"}>{getConsentStatusLabel(consent.status)}</Badge>
        <h1 className="mt-4 text-2xl font-bold text-ink">{consent.consent_type}</h1>
        <p className="mt-2 text-sm text-slate-500">Version {consent.consent_version}</p>
        <section className="mt-6"><h2 className="font-bold text-ink">Texto</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{consent.consent_text}</p></section>
        <section className="mt-6">
          <div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-clinic" /><h2 className="font-bold text-ink">Firmas registradas</h2></div>
          <div className="mt-3 grid gap-3">{consent.signatures.length ? consent.signatures.map((signature) => <div key={signature.id} className="rounded-md border border-slate-200 p-4"><p className="font-semibold text-ink">{signature.signer_full_name}</p><p className="mt-1 text-sm text-slate-500">{formatPatientTimestamp(signature.signed_at, consent.timeZone)}</p></div>) : <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No hay firmas registradas. La captura de firmas no esta habilitada en este flujo.</p>}</div>
        </section>
      </section>
    </>
  );
}
