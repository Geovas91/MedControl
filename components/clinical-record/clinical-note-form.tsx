"use client";

import { useActionState, useState } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { getTemplateContentSeed, type ClinicalNoteFormValues } from "@/lib/clinical-record/notes";
import type { NoteAppointmentOption, NoteTemplateOption } from "@/lib/server/clinical-notes";

type FormState = {
  error?: string;
  errors?: Record<string, string>;
  values?: ClinicalNoteFormValues;
};

type ClinicalNoteFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialValues: ClinicalNoteFormValues;
  templates: NoteTemplateOption[];
  appointments: NoteAppointmentOption[];
  cancelHref: string;
  timeZone: string;
  showRelations?: boolean;
};

export function ClinicalNoteForm({
  action,
  initialValues,
  templates,
  appointments,
  cancelHref,
  timeZone,
  showRelations = true,
}: ClinicalNoteFormProps) {
  const [state, formAction] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const [content, setContent] = useState(values.content);
  const formatAppointmentDate = (startsAt: string) => new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(startsAt));

  return (
    <form action={formAction} className="grid gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {state.error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {showRelations ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Plantilla" htmlFor="template_id">
            <Select id="template_id" name="template_id" defaultValue={values.templateId} onChange={(event) => {
              const template = templates.find((item) => item.id === event.target.value);
              if (template) setContent(getTemplateContentSeed(template.template_schema));
            }}>
              <option value="">Sin plantilla</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </Select>
          </Field>
          <Field label="Cita relacionada" htmlFor="appointment_id">
            <Select id="appointment_id" name="appointment_id" defaultValue={values.appointmentId}>
              <option value="">Sin cita relacionada</option>
              {appointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.title} - {formatAppointmentDate(appointment.starts_at)}</option>)}
            </Select>
          </Field>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Especialidad" htmlFor="specialty">
          <Input id="specialty" name="specialty" defaultValue={values.specialty} maxLength={120} />
          {state.errors?.specialty ? <span className="text-xs text-rose-700">{state.errors.specialty}</span> : null}
        </Field>
        <Field label="Impresion clinica" htmlFor="clinical_impression">
          <Textarea id="clinical_impression" name="clinical_impression" defaultValue={values.clinicalImpression} maxLength={4000} className="min-h-24" />
          {state.errors?.clinicalImpression ? <span className="text-xs text-rose-700">{state.errors.clinicalImpression}</span> : null}
        </Field>
      </div>
      <Field label="Contenido de la nota *" htmlFor="content">
        <Textarea id="content" name="content" value={content} onChange={(event) => setContent(event.target.value)} required maxLength={10000} className="min-h-64 whitespace-pre-wrap" />
        {state.errors?.content ? <span className="text-xs text-rose-700">{state.errors.content}</span> : null}
      </Field>
      <input type="hidden" name="expected_updated_at" value={values.expectedUpdatedAt} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="secondary">Cancelar</ButtonLink>
        <div className="sm:w-52"><AuthSubmitButton idleLabel="Guardar nota" pendingLabel="Guardando..." /></div>
      </div>
    </form>
  );
}
