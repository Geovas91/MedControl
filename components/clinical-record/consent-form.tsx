"use client";

import { useActionState } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { ConsentFormValues } from "@/lib/clinical-record/consents";

type FormState = { error?: string; errors?: Record<string, string>; values?: ConsentFormValues };
export function PatientConsentForm({ action, cancelHref }: { action: (state: FormState, formData: FormData) => Promise<FormState>; cancelHref: string }) {
  const [state, formAction] = useActionState(action, {});
  const values = state.values ?? { consentType: "", consentVersion: "v1", consentText: "" };
  return <form action={formAction} className="grid gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    {state.error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
    <div className="grid gap-4 md:grid-cols-2"><Field label="Tipo de consentimiento *" htmlFor="consent_type"><Input id="consent_type" name="consent_type" defaultValue={values.consentType} required maxLength={160} />{state.errors?.consentType ? <span className="text-xs text-rose-700">{state.errors.consentType}</span> : null}</Field><Field label="Versión *" htmlFor="consent_version"><Input id="consent_version" name="consent_version" defaultValue={values.consentVersion} required maxLength={80} />{state.errors?.consentVersion ? <span className="text-xs text-rose-700">{state.errors.consentVersion}</span> : null}</Field></div>
    <Field label="Texto del consentimiento *" htmlFor="consent_text"><Textarea id="consent_text" name="consent_text" defaultValue={values.consentText} required maxLength={12000} className="min-h-64 whitespace-pre-wrap" />{state.errors?.consentText ? <span className="text-xs text-rose-700">{state.errors.consentText}</span> : null}</Field>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><ButtonLink href={cancelHref} variant="secondary">Cancelar</ButtonLink><div className="sm:w-60"><AuthSubmitButton idleLabel="Crear consentimiento" pendingLabel="Creando..." /></div></div>
  </form>;
}
