import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClinicalNoteAction } from "@/app/dashboard/patients/[id]/notes/new/actions";
import { ClinicalNoteForm } from "@/components/clinical-record/clinical-note-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getClinicalNoteFormOptions } from "@/lib/server/clinical-notes";

export const dynamic = "force-dynamic";

export default async function NewClinicalNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getClinicalNoteFormOptions(id);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") {
    return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes permiso para crear notas clinicas.</section>;
  }

  const action = createClinicalNoteAction.bind(null, id);
  return (
    <>
      <Link href={`/dashboard/patients/${id}/clinical-record`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver al expediente</Link>
      <PageHeader title="Nueva nota clinica" description={`Registra una nota en borrador para ${result.data.patient.full_name}.`} />
      <ClinicalNoteForm action={action} initialValues={{ specialty: "", clinicalImpression: "", content: "", appointmentId: "", templateId: "", expectedUpdatedAt: "" }} templates={result.data.templates} appointments={result.data.appointments} timeZone={result.data.timeZone} cancelHref={`/dashboard/patients/${id}/clinical-record`} />
    </>
  );
}
