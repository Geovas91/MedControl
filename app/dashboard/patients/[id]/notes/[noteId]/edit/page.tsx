import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { updateClinicalNoteAction } from "@/app/dashboard/patients/[id]/notes/[noteId]/edit/actions";
import { ClinicalNoteForm } from "@/components/clinical-record/clinical-note-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getClinicalNoteContent } from "@/lib/clinical-record/notes";
import { getClinicalNoteForActiveTenant, getClinicalNoteFormOptions } from "@/lib/server/clinical-notes";

export const dynamic = "force-dynamic";

export default async function EditClinicalNotePage({ params }: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await params;
  const [noteResult, optionsResult] = await Promise.all([getClinicalNoteForActiveTenant(id, noteId), getClinicalNoteFormOptions(id)]);
  if (noteResult.state === "invalid_id" || noteResult.state === "not_found" || optionsResult.state === "invalid_id" || optionsResult.state === "not_found") notFound();
  if (noteResult.state === "unauthenticated" || optionsResult.state === "unauthenticated") redirect("/login");
  if (noteResult.state === "ready" && !noteResult.data.canEdit) notFound();
  if (noteResult.state !== "ready" || optionsResult.state !== "ready") {
    return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Esta nota no puede editarse.</section>;
  }

  const note = noteResult.data.note;
  const action = updateClinicalNoteAction.bind(null, id, noteId);
  return (
    <>
      <Link href={`/dashboard/patients/${id}/notes/${noteId}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a la nota</Link>
      <PageHeader title="Editar nota clinica" description="Solo se actualizan los campos editables de este borrador." />
      <ClinicalNoteForm action={action} initialValues={{ specialty: note.specialty ?? "", clinicalImpression: note.clinical_impression ?? "", content: getClinicalNoteContent(note.note_data), appointmentId: "", templateId: "", expectedUpdatedAt: note.updated_at }} templates={optionsResult.data.templates} appointments={optionsResult.data.appointments} timeZone={optionsResult.data.timeZone} showRelations={false} cancelHref={`/dashboard/patients/${id}/notes/${noteId}`} />
    </>
  );
}
