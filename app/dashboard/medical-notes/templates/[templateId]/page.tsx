import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { medicalNoteTemplates } from "@/lib/medical-note-templates";

export function generateStaticParams() {
  return medicalNoteTemplates.map((template) => ({ templateId: template.id }));
}

export default async function MedicalNoteTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const template = medicalNoteTemplates.find((item) => item.id === templateId);

  if (!template) {
    notFound();
  }

  return (
    <>
      <Link
        href="/dashboard/medical-notes/templates"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to templates
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="teal">{template.specialty}</Badge>
            <h1 className="mt-4 text-3xl font-bold text-ink">{template.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{template.description}</p>
          </div>
          <ButtonLink href="/dashboard/medical-notes/new" variant="secondary">
            <Plus className="h-4 w-4" />
            Use template
          </ButtonLink>
        </div>

        <div className="mt-8 grid gap-5">
          {template.sections.map((section) => (
            <article key={section.id} className="rounded-md border border-slate-200 p-4">
              <h2 className="font-bold text-ink">{section.title}</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {section.fields.map((field) => (
                  <div key={field.id} className="rounded-md bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-ink">{field.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{field.type}</p>
                    {field.required ? <p className="mt-1 text-xs font-semibold text-amber-700">Required</p> : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
