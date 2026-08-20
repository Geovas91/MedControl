"use client";

import { Save } from "lucide-react";
import { useActionState, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UpdateConsentState } from "@/app/dashboard/patients/[id]/consents/[consentId]/actions";
import { ConsentSigningLinkControls } from "@/components/clinical-record/consent-signing-link-controls";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { canEditIssuedConsent, hasUnsavedConsentChanges, UNSAVED_CONSENT_MESSAGE, type EditableConsentValues } from "@/lib/consents/editing";

type SigningLinkState = { error?: string; url?: string; expiresAt?: string; updatedAt?: string };
type EmailState = { error?: string; sentTo?: string };

export function PendingConsentWorkspace({
  initialValues,
  initialUpdatedAt,
  updateAction,
  signingAction,
  emailAction,
  revokeAction,
  cancelAction,
  hasActiveLink,
  patientEmail,
  signingTokenExpiresAt,
  signingTokenUsedAt,
  signingTokenRevokedAt
}: {
  initialValues: EditableConsentValues;
  initialUpdatedAt: string;
  updateAction: (state: UpdateConsentState, formData: FormData) => Promise<UpdateConsentState>;
  signingAction: (state: SigningLinkState, formData: FormData) => Promise<SigningLinkState>;
  emailAction: (state: EmailState, formData: FormData) => Promise<EmailState>;
  revokeAction: () => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
  hasActiveLink: boolean;
  patientEmail: string | null;
  signingTokenExpiresAt: string | null;
  signingTokenUsedAt: string | null;
  signingTokenRevokedAt: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [persistedValues, setPersistedValues] = useState(initialValues);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(initialUpdatedAt);
  const [linkActive, setLinkActive] = useState(hasActiveLink);
  async function saveCurrentConsent(previousState: UpdateConsentState, formData: FormData) {
    const result = await updateAction(previousState, formData);
    if (result.status === "saved" && result.values && result.updatedAt) {
      setValues(result.values);
      setPersistedValues(result.values);
      setExpectedUpdatedAt(result.updatedAt);
      router.refresh();
    }
    return result;
  }

  const [state, formAction, isSaving] = useActionState(saveCurrentConsent, {});
  const dirty = useMemo(() => hasUnsavedConsentChanges(values, persistedValues), [values, persistedValues]);
  const editorEnabled = canEditIssuedConsent("pending", linkActive);
  const signingActionsBlocked = dirty || isSaving;
  const handleActiveLinkChange = useCallback((active: boolean, updatedAt?: string) => {
    setLinkActive(active);
    if (updatedAt) setExpectedUpdatedAt(updatedAt);
  }, []);

  return <>
    <section className="mt-4 rounded-md border border-slate-200 bg-slate-50/50 p-4">
      <h1 className="text-xl font-bold text-ink">Contenido del consentimiento</h1>
      <p className="mt-2 text-sm text-slate-600">Este es el snapshot emitido para este paciente. Guardarlo no modifica la plantilla reutilizable.</p>
      {linkActive ? <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Revoca el enlace vigente antes de editar el consentimiento.</p> : null}
      <form action={formAction} className="mt-4 grid gap-4">
        <input type="hidden" name="expected_updated_at" value={expectedUpdatedAt} />
        <input type="hidden" name="template_id" value="" />
        <fieldset disabled={!editorEnabled || isSaving} className="grid gap-4 disabled:opacity-75">
          <Field label="Tipo de consentimiento" htmlFor="consent_type">
            <Input id="consent_type" name="consent_type" maxLength={160} required value={values.consentType} onChange={(event) => setValues((current) => ({ ...current, consentType: event.target.value }))} />
          </Field>
          <Field label="Versión" htmlFor="consent_version">
            <Input id="consent_version" name="consent_version" maxLength={80} required value={values.consentVersion} onChange={(event) => setValues((current) => ({ ...current, consentVersion: event.target.value }))} />
          </Field>
          <Field label="Texto que verá y firmará el paciente" htmlFor="consent_text">
            <Textarea id="consent_text" name="consent_text" maxLength={12000} rows={12} required value={values.consentText} onChange={(event) => setValues((current) => ({ ...current, consentText: event.target.value }))} />
          </Field>
        </fieldset>
        {dirty ? <p id="consent-unsaved-warning" role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{UNSAVED_CONSENT_MESSAGE}</p> : null}
        {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
        {state.status === "saved" && !dirty ? <p role="status" className="text-sm text-emerald-700">Los cambios se guardaron correctamente.</p> : null}
        <div>
          <Button type="submit" disabled={!editorEnabled || !dirty || isSaving} aria-describedby={dirty ? "consent-unsaved-warning" : undefined}>
            <Save className="h-4 w-4" />{isSaving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </section>
    <ConsentSigningLinkControls
      action={signingAction}
      emailAction={emailAction}
      revokeAction={revokeAction}
      cancelAction={cancelAction}
      hasActiveLink={linkActive}
      expectedUpdatedAt={expectedUpdatedAt}
      patientEmail={patientEmail}
      signingTokenExpiresAt={signingTokenExpiresAt}
      signingTokenUsedAt={signingTokenUsedAt}
      signingTokenRevokedAt={signingTokenRevokedAt}
      signingActionsBlocked={signingActionsBlocked}
      signingActionsBlockedMessage={dirty ? UNSAVED_CONSENT_MESSAGE : "Espera a que termine el guardado antes de generar un enlace de firma."}
      onActiveLinkChange={handleActiveLinkChange}
    />
  </>;
}
