import { PageHeader } from "@/components/dashboard/page-header";
import { MedicalNoteForm } from "@/components/medical-notes/medical-note-form";
import { medicalNoteTemplates } from "@/lib/medical-note-templates";
import { patients } from "@/lib/mock-data";

export default function NewMedicalNotePage() {
  return (
    <>
      <PageHeader
        title="Create medical note"
        description="Choose a general or specialty template and preview a professional note document."
      />
      <MedicalNoteForm templates={medicalNoteTemplates} patients={patients} />
    </>
  );
}
