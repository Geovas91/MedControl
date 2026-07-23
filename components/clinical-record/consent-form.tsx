"use client";

import { useActionState, useState } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { getTemplateContent } from "@/lib/clinical-record/templates";
import type { ConsentFormValues } from "@/lib/clinical-record/consents";

type Template = { id: string; name: string; description: string | null; template_schema: Parameters<typeof getTemplateContent>[0]; is_system_template: boolean };
type FormState = { error?: string; errors?: Record<string, string>; values?: ConsentFormValues };
export function PatientConsentForm({ action, cancelHref, templates }: { action: (state: FormState, formData: FormData) => Promise<FormState>; cancelHref: string; templates: Template[] }) {
  const [state, formAction] = useActionState(action, {});
  const values = state.values ?? { consentType: "", consentVersion: "v1", consentText: "", templateId: "" };
  const [content, setContent] = useState(values.consentText);
  return <form action={formAction} className="grid gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    {state.error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
    {templates.length ? <Field label="Plantilla de consentimiento" htmlFor="template_id"><Select id="template_id" name="template_id" defaultValue={values.templateId} onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) setContent(getTemplateContent(template.template_schema)); }}><option value="">Sin plantilla</option>{templates.some((template) => template.is_system_template) ? <optgroup label="Recomendadas por CliniControl">{templates.filter((template) => template.is_system_template).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</optgroup> : null}{templates.some((template) => !template.is_system_template) ? <optgroup label="Mi clínica">{templates.filter((template) => !template.is_system_template).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</optgroup> : null}</Select></Field> : null}
    <div className="grid gap-4 md:grid-cols-2"><Field label="Tipo de consentimiento *" htmlFor="consent_type"><Input id="consent_type" name="consent_type" defaultValue={values.consentType} required maxLength={160} />{state.errors?.consentType ? <span className="text-xs text-rose-700">{state.errors.consentType}</span> : null}</Field><Field label="Version *" htmlFor="consent_version"><Input id="consent_version" name="consent_version" defaultValue={values.consentVersion} required maxLength={80} />{state.errors?.consentVersion ? <span className="text-xs text-rose-700">{state.errors.consentVersion}</span> : null}</Field></div>
    <Field label="Texto del consentimiento *" htmlFor="consent_text"><Textarea id="consent_text" name="consent_text" value={content} onChange={(event) => setContent(event.target.value)} required maxLength={12000} className="min-h-64 whitespace-pre-wrap" />{state.errors?.consentText ? <span className="text-xs text-rose-700">{state.errors.consentText}</span> : null}</Field>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><ButtonLink href={cancelHref} variant="secondary">Cancelar</ButtonLink><div className="sm:w-60"><AuthSubmitButton idleLabel="Crear consentimiento" pendingLabel="Creando..." /></div></div>
  </form>;
}
