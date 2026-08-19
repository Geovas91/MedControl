"use client";

import { Copy, Link2, Mail, QrCode, RotateCcw, X, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { createConsentSigningQr, getConsentSigningQrAvailability } from "@/lib/consents/signing-qr";
import { getConsentEmailAvailability } from "@/lib/consents/email";

type SigningLinkState = { error?: string; url?: string; expiresAt?: string };
type EmailState = { error?: string; sentTo?: string };

function GenerateSigningLinkButton({ hasActiveLink }: { hasActiveLink: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Link2 className="h-4 w-4" />{pending ? "Generando enlace…" : hasActiveLink ? "Regenerar enlace" : "Generar enlace de firma"}</Button>;
}

function SendEmailButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Mail className="h-4 w-4" />{pending ? "Enviando…" : "Confirmar envío"}</Button>;
}

export function ConsentSigningLinkControls({ action, emailAction, revokeAction, cancelAction, hasActiveLink, patientEmail, signingTokenExpiresAt, signingTokenUsedAt, signingTokenRevokedAt }: { action: (state: SigningLinkState, formData: FormData) => Promise<SigningLinkState>; emailAction: (state: EmailState, formData: FormData) => Promise<EmailState>; revokeAction: () => Promise<void>; cancelAction: (formData: FormData) => Promise<void>; hasActiveLink: boolean; patientEmail: string | null; signingTokenExpiresAt: string | null; signingTokenUsedAt: string | null; signingTokenRevokedAt: string | null }) {
  const [state, formAction] = useActionState(action, {});
  const [emailState, emailFormAction] = useActionState(emailAction, {});
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>();
  const [qrError, setQrError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailDialogRef = useRef<HTMLDialogElement>(null);
  const effectiveHasActiveLink = hasActiveLink || Boolean(state.url);
  const qrAvailability = getConsentSigningQrAvailability({ status: "pending", hasActiveLink: effectiveHasActiveLink, signingUrl: state.url });
  const emailAvailability = getConsentEmailAvailability({ status: "pending", patientEmail, signingUrl: state.url, signingTokenExpiresAt: state.expiresAt ?? signingTokenExpiresAt, signingTokenUsedAt, signingTokenRevokedAt });

  useEffect(() => {
    if (emailState.sentTo) emailDialogRef.current?.close();
  }, [emailState.sentTo]);

  async function showQr() {
    if (!qrAvailability.available) return;
    setQrError(false);
    setQrSvg(undefined);
    dialogRef.current?.showModal();

    try {
      const qr = await createConsentSigningQr(qrAvailability.signingUrl);
      setQrSvg(qr.svg);
    } catch {
      setQrError(true);
    }
  }

  return <section className="mt-6 rounded-md border border-slate-200 p-4">
    <h2 className="font-bold text-ink">Enlace de firma</h2>
    <p className="mt-2 text-sm text-slate-600">Este enlace permite revisar y firmar el consentimiento. Compártelo únicamente con el paciente correspondiente.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <form action={formAction}><GenerateSigningLinkButton hasActiveLink={effectiveHasActiveLink} /></form>
      <Button id="consent-qr-trigger" type="button" variant="secondary" disabled={!qrAvailability.available} aria-describedby={!qrAvailability.available ? "consent-qr-availability" : undefined} onClick={() => { void showQr(); }}><QrCode className="h-4 w-4" />Mostrar QR</Button>
      <Button id="consent-email-trigger" type="button" variant="secondary" disabled={!emailAvailability.available} aria-describedby={!emailAvailability.available ? "consent-email-availability" : undefined} onClick={() => emailDialogRef.current?.showModal()}><Mail className="h-4 w-4" />Enviar por correo</Button>
      {effectiveHasActiveLink ? <form action={revokeAction}><Button type="submit" variant="secondary"><RotateCcw className="h-4 w-4" />Revocar enlace</Button></form> : null}
    </div>
    {!qrAvailability.available ? <p id="consent-qr-availability" className="mt-2 text-xs text-slate-500">{qrAvailability.reason === "missing_link" ? "Genera primero un enlace de firma." : "Genera un enlace nuevo en esta sesión para mostrar su QR."}</p> : null}
    {!emailAvailability.available ? <p id="consent-email-availability" className="mt-2 text-xs text-slate-500">{emailAvailability.reason === "missing_email" ? "Este paciente no tiene correo electrónico registrado." : emailAvailability.reason === "missing_url" ? "Genera un enlace nuevo en esta sesión para enviarlo por correo." : "El enlace de firma no está disponible para envío."}</p> : null}
    {state.url ? <div className="mt-4 rounded-md bg-teal-50 p-3"><p className="break-all text-sm text-slate-700">{state.url}</p><Button type="button" variant="ghost" className="mt-2" onClick={() => { void navigator.clipboard.writeText(state.url!); setCopied(true); }}><Copy className="h-4 w-4" />{copied ? "Copiado" : "Copiar enlace"}</Button></div> : null}
    {state.error ? <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p> : null}
    {emailState.sentTo ? <p role="status" className="mt-3 text-sm text-emerald-700">Consentimiento enviado a {emailState.sentTo}</p> : null}
    {emailState.error ? <p role="alert" className="mt-3 text-sm text-rose-700">{emailState.error}</p> : null}
    <form action={cancelAction} className="mt-6 border-t border-slate-200 pt-5"><label htmlFor="cancellation_reason" className="text-sm font-semibold text-ink">Cancelar consentimiento</label><p className="mt-1 text-xs leading-5 text-slate-500">Solo es posible antes de la firma. El consentimiento se conservará como evidencia.</p><input id="cancellation_reason" name="cancellation_reason" maxLength={500} placeholder="Motivo opcional" className="mt-3 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" /><Button type="submit" variant="secondary" className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-50"><XCircle className="h-4 w-4" />Cancelar consentimiento</Button></form>
    <dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="consent-qr-title" aria-describedby="consent-qr-description" onClose={() => document.getElementById("consent-qr-trigger")?.focus()} className="w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/50">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="consent-qr-title" className="text-lg font-bold text-ink">QR de firma</h2><p id="consent-qr-description" className="mt-2 text-sm leading-6 text-slate-600">Escanea este código con el celular del paciente para abrir el consentimiento.</p></div><button type="button" onClick={() => dialogRef.current?.close()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label="Cerrar QR"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 flex min-h-80 items-center justify-center rounded-md border border-slate-200 bg-white p-3">{qrSvg ? <div role="img" aria-label="Código QR del enlace de firma" className="w-full max-w-80" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : qrError ? <p role="alert" className="text-center text-sm text-rose-700">No fue posible generar el QR. Cierra el diálogo e inténtalo nuevamente.</p> : <p role="status" className="text-sm text-slate-500">Generando QR…</p>}</div>
        <Button type="button" variant="secondary" className="mt-5 w-full" onClick={() => dialogRef.current?.close()}>Cerrar</Button>
      </div>
    </dialog>
    <dialog ref={emailDialogRef} role="dialog" aria-modal="true" aria-labelledby="consent-email-title" aria-describedby="consent-email-description" onClose={() => document.getElementById("consent-email-trigger")?.focus()} className="w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/50">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="consent-email-title" className="text-lg font-bold text-ink">Enviar por correo</h2><p id="consent-email-description" className="mt-2 text-sm leading-6 text-slate-600">Enviar consentimiento a:</p><p className="mt-1 break-all font-semibold text-ink">{patientEmail}</p></div><button type="button" onClick={() => emailDialogRef.current?.close()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label="Cerrar envío por correo"><X className="h-4 w-4" /></button></div>
        <p className="mt-4 text-sm leading-6 text-slate-600">Se enviará el mismo enlace personal disponible para copiar y mostrar como QR.</p>
        <form action={emailFormAction} className="mt-5 flex flex-wrap gap-3">
          <input type="hidden" name="signing_url" value={state.url ?? ""} />
          <SendEmailButton />
          <Button type="button" variant="secondary" onClick={() => emailDialogRef.current?.close()}>Cancelar</Button>
        </form>
      </div>
    </dialog>
  </section>;
}
