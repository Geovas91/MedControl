import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MedicalNoteTemplate } from "@/types/medical-note";

export function TemplateCard({ template }: { template: MedicalNoteTemplate }) {
  return (
    <Link
      href={`/dashboard/medical-notes/templates/${template.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">
          <ClipboardList className="h-5 w-5" />
        </div>
        <Badge variant="teal">{template.specialty}</Badge>
      </div>
      <h2 className="mt-5 text-lg font-bold text-ink">{template.name}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{template.description}</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {template.sections.length} sections
      </p>
    </Link>
  );
}
