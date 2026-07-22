import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getClinicalNoteContent } from "@/lib/clinical-record/notes";
import { formatPatientTimestamp, getMedicalNoteStatusLabel } from "@/lib/patients/detail";
import { getClinicalNoteForActiveTenant } from "@/lib/server/clinical-notes";

export const dynamic = "force-dynamic";

export default async function ClinicalNotePage({ params, searchParams }: { params: Promise<{ id: string; noteId: string }>; searchParams: Promise<{ note_created?: string | string[]; note_updated?: string | string[] }> }) {
  const { id, noteId } = await params;
  const [result, query] = await Promise.all([getClinicalNoteForActiveTenant(id, noteId), searchParams]);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No tienes acceso a esta nota clinica.</section>;

  const { note, canEdit, timeZone } = result.data;
  const message = query.note_updated === "1" ? "La nota clinica se actualizo correctamente." : query.note_created === "1" ? "La nota clinica se creo correctamente." : null;
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
          {canEdit ? <ButtonLink href={`/dashboard/patients/${id}/notes/${note.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />Editar nota</ButtonLink> : null}
        </div>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-4"><dt className="text-sm font-semibold text-slate-500">Cita relacionada</dt><dd className="mt-2 text-sm text-ink">{note.appointment_id && note.appointmentTitle ? <Link className="font-semibold text-clinic hover:underline" href={`/dashboard/appointments/${note.appointment_id}`}>{note.appointmentTitle}</Link> : "Sin registro"}</dd></div>
          <div className="rounded-md bg-slate-50 p-4"><dt className="text-sm font-semibold text-slate-500">Plantilla</dt><dd className="mt-2 text-sm text-ink">{note.templateName ?? "Sin registro"}</dd></div>
        </dl>
        {note.clinical_impression ? <section className="mt-6"><h2 className="font-bold text-ink">Impresion clinica</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{note.clinical_impression}</p></section> : null}
        <section className="mt-6"><h2 className="font-bold text-ink">Contenido</h2><p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{getClinicalNoteContent(note.note_data)}</p></section>
      </section>
    </>
  );
}
