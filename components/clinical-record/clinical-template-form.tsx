"use client";

import { useActionState } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { TemplateFormValues } from "@/lib/clinical-record/templates";

type State = { error?: string; errors?: Record<string, string>; values?: TemplateFormValues };
export function ClinicalTemplateForm({ action, initialValues, cancelHref }: { action: (state: State, formData: FormData) => Promise<State>; initialValues: TemplateFormValues; cancelHref: string }) {
  const [state, formAction] = useActionState(action, {});
  const values = state.values ?? initialValues;
  return <form action={formAction} className="grid gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    {state.error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
    <div className="grid gap-4 md:grid-cols-2"><Field label="Nombre *" htmlFor="name"><Input id="name" name="name" defaultValue={values.name} required maxLength={160} />{state.errors?.name ? <span className="text-xs text-rose-700">{state.errors.name}</span> : null}</Field><Field label="Tipo" htmlFor="kind"><Select id="kind" name="kind" defaultValue={values.kind}><option value="note">Nota clinica</option><option value="consent">Consentimiento</option></Select></Field></div>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Especialidad" htmlFor="specialty"><Input id="specialty" name="specialty" defaultValue={values.specialty} maxLength={120} /></Field><Field label="Descripcion" htmlFor="description"><Input id="description" name="description" defaultValue={values.description} maxLength={500} /></Field></div>
    <Field label="Contenido *" htmlFor="content"><Textarea id="content" name="content" defaultValue={values.content} required maxLength={12000} className="min-h-64 whitespace-pre-wrap" />{state.errors?.content ? <span className="text-xs text-rose-700">{state.errors.content}</span> : null}</Field>
    <label className="flex items-center gap-3 text-sm text-slate-700"><input name="is_active" type="checkbox" defaultChecked={values.isActive} className="h-4 w-4 rounded border-slate-300 text-clinic" />Disponible en formularios nuevos</label><input type="hidden" name="expected_updated_at" value={values.expectedUpdatedAt} />
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><ButtonLink href={cancelHref} variant="secondary">Cancelar</ButtonLink><AuthSubmitButton idleLabel="Guardar plantilla" pendingLabel="Guardando..." /></div>
  </form>;
}
