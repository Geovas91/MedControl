import { PageHeader } from "@/components/dashboard/page-header";
import { MedicalNoteForm } from "@/components/medical-notes/medical-note-form";
import { medicalNoteTemplates } from "@/lib/medical-note-templates";
import { patients } from "@/lib/mock-data";

export default function NewMedicalNotePage() {
  return (
    <>
      <PageHeader
        title="Crear nota médica"
        description="Elige una plantilla general o por especialidad y revisa la vista previa del documento."
      />
      <MedicalNoteForm templates={medicalNoteTemplates} patients={patients} />
    </>
  );
}
