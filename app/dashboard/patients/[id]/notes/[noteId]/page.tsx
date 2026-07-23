import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { finalizeClinicalNoteAction } from "@/app/dashboard/patients/[id]/notes/[noteId]/actions";
import { FinalizeClinicalNote } from "@/components/clinical-record/finalize-clinical-note";
import { getClinicalNoteContent } from "@/lib/clinical-record/notes";
import { formatPatientTimestamp, getMedicalNoteStatusLabel } from "@/lib/patients/detail";
import { getClinicalNoteForActiveTenant } from "@/lib/server/clinical-notes";

export const dynamic = "force-dynamic";

export default async function ClinicalNotePage({ params, searchParams }: { params: Promise<{ id: string; noteId: string }>; searchParams: Promise<{ note_created?: string | string[]; note_updated?: string | string[]; note_finalized?: string | string[] }> }) {
  const { id, noteId } = await params;
  const [result, query] = await Promise.all([getClinicalNoteForActiveTenant(id, noteId), searchParams]);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes acceso a esta nota clinica.</section>;

  const { note, canEdit, canFinalize, timeZone } = result.data;
  const message = query.note_finalized === "1" ? "La nota clínica se finalizó correctamente." : query.note_updated === "1" ? "La nota clinica se actualizo correctamente." : query.note_created === "1" ? "La nota clinica se creo correctamente." : null;
  const finalizeAction = finalizeClinicalNoteAction.bind(null, id, noteId);
  return (
    <>
      <Link href={`/dashboard/patients/${id}/clinical-record`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver al expediente</Link>
      {message ? <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div>
            <Badge variant={note.status === "finalized" ? "green" : note.status === "draft" ? "amber" : "slate"}>{getMedicalNoteStatusLabel(note.status)}</Badge>
            <h1 className="mt-4 text-2xl font-bold text-ink">{note.specialty ?? note.templateName ?? "Nota clinica"}</h1>
            <p className="mt-2 text-sm text-slate-500">Creada: {formatPatientTimestamp(note.created_at, timeZone)} - {note.doctorName ?? "Sin registro"}</p>
            <p className="mt-1 text-sm text-slate-500">Actualizada: {formatPatientTimestamp(note.updated_at, timeZone)}</p>
          </div>
          {canEdit || canFinalize ? <div className="flex flex-wrap gap-2">{canEdit ? <ButtonLink href={`/dashboard/patients/${id}/notes/${note.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />Editar nota</ButtonLink> : null}{canFinalize ? <FinalizeClinicalNote action={finalizeAction} expectedUpdatedAt={note.updated_at} /> : null}</div> : null}
        </div>
        {note.status === "finalized" ? <section className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">Esta nota forma parte del expediente clínico y ya no puede modificarse.</p><p className="mt-2">Finalizada: {note.finalized_at ? formatPatientTimestamp(note.finalized_at, timeZone) : "Sin registro"}</p><p className="mt-1">Finalizada por: {note.finalizedByName ?? "Sin registro"}</p></section> : null}
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-4"><dt className="text-sm font-semibold text-slate-500">Cita relacionada</dt><dd className="mt-2 text-sm text-ink">{note.appointment_id && note.appointmentTitle ? <Link className="font-semibold text-clinic hover:underline" href={`/dashboard/appointments/${note.appointment_id}`}>{note.appointmentTitle}</Link> : "Sin registro"}</dd></div>
          <div className="rounded-md bg-slate-50 p-4"><dt className="text-sm font-semibold text-slate-500">Plantilla</dt><dd className="mt-2 text-sm text-ink">{note.templateName ?? "Sin registro"}</dd></div>
        </dl>
        {note.clinical_impression ? <section className="mt-6"><h2 className="font-bold text-ink">Impresion clinica</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{note.clinical_impression}</p></section> : null}
        {note.diagnosis ? <section className="mt-6"><h2 className="font-bold text-ink">Diagnóstico</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{note.diagnosis}</p></section> : null}
        {note.icd10_code ? <section className="mt-6"><h2 className="font-bold text-ink">Código ICD-10</h2><p className="mt-3 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{note.icd10_code}</p></section> : null}
        <section className="mt-6"><h2 className="font-bold text-ink">Contenido</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{getClinicalNoteContent(note.note_data)}</p></section>
      </section>
    </>
  );
}
