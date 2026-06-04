import Link from "next/link";
import { Eye, FilePenLine, Plus, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { mockMedicalNotes } from "@/lib/mock-medical-notes";
import { formatDate } from "@/lib/utils";

export default function MedicalNotesPage() {
  return (
    <>
      <PageHeader
        title="Medical notes"
        description="Mock clinical documentation workspace with specialty templates."
        action={{ label: "New note", href: "/dashboard/medical-notes/new", icon: <Plus className="h-4 w-4" /> }}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <ButtonLink href="/dashboard/medical-notes/templates" variant="secondary">
          Browse templates
        </ButtonLink>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.6fr_0.7fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid">
          <span>Patient</span>
          <span>Doctor</span>
          <span>Specialty</span>
          <span>Template</span>
          <span>Date</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-slate-200">
          {mockMedicalNotes.map((note) => (
            <article
              key={note.id}
              className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.6fr_0.7fr_0.9fr] xl:items-center"
            >
              <div>
                <p className="font-semibold text-ink">{note.patientName}</p>
                <p className="mt-1 text-sm text-slate-500 xl:hidden">{note.clinicalImpression}</p>
              </div>
              <p className="text-sm text-slate-600">{note.doctorName}</p>
              <p className="text-sm text-slate-600">{note.specialty}</p>
              <p className="text-sm text-slate-600">{note.templateName}</p>
              <p className="text-sm text-slate-600">{formatDate(note.date)}</p>
              <Badge variant={note.status === "Finalized" ? "green" : "amber"}>{note.status}</Badge>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/medical-notes/templates/${note.templateId}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Eye className="h-4 w-4" />
                  View
                </Link>
                <Link href="/dashboard/medical-notes/new" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FilePenLine className="h-4 w-4" />
                  Edit
                </Link>
                <Link href="/dashboard/medical-notes/new" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Printer className="h-4 w-4" />
                  Print preview
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
