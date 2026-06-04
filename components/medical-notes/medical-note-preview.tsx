import type { MedicalNoteFormValues, MedicalNoteTemplate } from "@/types/medical-note";
import { getDisplayValue } from "@/components/medical-notes/field-renderer";

type MedicalNotePreviewProps = {
  template: MedicalNoteTemplate;
  values: MedicalNoteFormValues;
  patientName: string;
  doctorName: string;
};

export function MedicalNotePreview({ template, values, patientName, doctorName }: MedicalNotePreviewProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:border-0 print:shadow-none">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-clinic">MedControl Clinic</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Medical note preview</h2>
        <p className="mt-1 text-sm text-slate-500">Demo print preview. Do not use with real patient information yet.</p>
      </header>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-500">Doctor</dt>
          <dd className="text-ink">{doctorName || "Dr. Morgan"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Patient</dt>
          <dd className="text-ink">{patientName || "Select a patient"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Template</dt>
          <dd className="text-ink">{template.name}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Specialty</dt>
          <dd className="text-ink">{template.specialty}</dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-5">
        {template.sections.map((section) => (
          <section key={section.id} className="break-inside-avoid rounded-md border border-slate-200 p-4">
            <h3 className="font-bold text-ink">{section.title}</h3>
            <div className="mt-3 grid gap-3">
              {section.fields.map((field) => (
                <div key={field.id} className="text-sm">
                  <p className="font-semibold text-slate-500">{field.label}</p>
                  <p className="mt-1 whitespace-pre-line text-slate-800">{getDisplayValue(values, field.id)}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-8 border-t border-slate-200 pt-4">
        <div className="mt-8 max-w-xs border-t border-slate-300 pt-2 text-sm text-slate-600">Doctor signature placeholder</div>
        <p className="mt-6 text-xs text-slate-400">
          Demo mode footer: this preview is for interface testing only and is not connected to a database.
        </p>
      </footer>
    </article>
  );
}
