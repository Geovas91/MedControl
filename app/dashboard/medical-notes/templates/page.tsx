import { PageHeader } from "@/components/dashboard/page-header";
import { TemplateCard } from "@/components/medical-notes/template-card";
import { medicalNoteTemplates } from "@/lib/medical-note-templates";

export default function MedicalNoteTemplatesPage() {
  return (
    <>
      <PageHeader
        title="Medical note templates"
        description="General and specialty-specific templates for demo documentation workflows."
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {medicalNoteTemplates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </section>
    </>
  );
}
