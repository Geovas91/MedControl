"use client";

import { useMemo, useState } from "react";
import { Printer, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { FieldRenderer } from "@/components/medical-notes/field-renderer";
import { MedicalNotePreview } from "@/components/medical-notes/medical-note-preview";
import { TemplateSelector } from "@/components/medical-notes/template-selector";
import type { Patient } from "@/lib/types";
import type { MedicalNoteFormValues, MedicalNoteTemplate } from "@/types/medical-note";

type MedicalNoteFormProps = {
  templates: MedicalNoteTemplate[];
  patients: Patient[];
};

const doctorName = "Dr. Morgan";
const licenseNumber = "Demo license";

export function MedicalNoteForm({ templates, patients }: MedicalNoteFormProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id ?? "");
  const [values, setValues] = useState<MedicalNoteFormValues>({});
  const [statusMessage, setStatusMessage] = useState("Form is ready for demo input.");

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0],
    [selectedTemplateId, templates]
  );
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? patients[0],
    [selectedPatientId, patients]
  );

  function updateValue(fieldId: string, value: string | boolean) {
    setValues((current) => ({ ...current, [fieldId]: value }));
  }

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    setValues({});
    setStatusMessage("Template changed. Preview reset for the selected specialty.");
  }

  const previewValues: MedicalNoteFormValues = {
    ...values,
    doctorName,
    licenseNumber,
    specialty: selectedTemplate?.specialty ?? "",
    patientName: selectedPatient?.name ?? "",
    age: selectedPatient?.age ? String(selectedPatient.age) : "",
    sex: selectedPatient?.gender ?? ""
  };

  if (!selectedTemplate || !selectedPatient) {
    return <p className="text-sm text-slate-500">Templates or patients are missing.</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <section className="grid gap-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Demo data only. Do not enter real patient information yet.</p>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Note setup</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TemplateSelector templates={templates} selectedTemplateId={selectedTemplateId} onChange={handleTemplateChange} />
            <Field label="Patient" htmlFor="patient">
              <Select id="patient" value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)}>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-5 rounded-md bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-ink">Doctor information</p>
            <p className="mt-1 text-slate-600">{doctorName}</p>
            <p className="text-slate-500">Professional license: {licenseNumber}</p>
            <p className="text-slate-500">Specialty: {selectedTemplate.specialty}</p>
          </div>
        </section>

        {selectedTemplate.sections.map((section) => (
          <section key={section.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-ink">{section.title}</h2>
            {section.description ? <p className="mt-1 text-sm text-slate-500">{section.description}</p> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.id} className={field.type === "textarea" || field.type === "signature" ? "md:col-span-2" : undefined}>
                  <FieldRenderer field={field} value={previewValues[field.id]} onChange={updateValue} />
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-slate-200 bg-slate-50 py-4 sm:flex-row">
          <Button type="button" onClick={() => setStatusMessage("Draft saved locally for demo purposes.")}>
            <Save className="h-4 w-4" />
            Save draft
          </Button>
          <Button type="button" variant="secondary" onClick={() => setStatusMessage("Note marked as finalized in demo mode.")}>
            Mark as finalized
          </Button>
          <Button type="button" variant="secondary" onClick={() => setStatusMessage("Print preview is ready in the panel.")}>
            <Printer className="h-4 w-4" />
            Print preview
          </Button>
        </div>
        <p className="text-sm text-slate-500">{statusMessage}</p>
      </section>

      <aside className="xl:sticky xl:top-6 xl:h-fit">
        <MedicalNotePreview
          template={selectedTemplate}
          values={previewValues}
          patientName={selectedPatient.name}
          doctorName={doctorName}
        />
      </aside>
    </div>
  );
}
