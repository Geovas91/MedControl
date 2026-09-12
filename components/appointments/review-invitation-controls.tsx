"use client";

import { Copy, Link2, Mail, XCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReviewInvitationActionState } from "@/app/dashboard/appointments/[id]/actions";
import type { ReviewInvitationStatus } from "@/types/reviews";

const labels: Record<ReviewInvitationStatus, string> = { pending: "Pendiente", sent: "Enviada", completed: "Completada", revoked: "Revocada", expired: "Expirada" };
const variants: Record<ReviewInvitationStatus, "amber" | "green" | "red" | "slate"> = { pending: "amber", sent: "green", completed: "green", revoked: "red", expired: "slate" };

export function ReviewInvitationControls({ issueAction, emailAction, revokeAction, initialStatus, patientHasEmail }: {
  issueAction: (state: ReviewInvitationActionState) => Promise<ReviewInvitationActionState>;
  emailAction: (state: ReviewInvitationActionState, formData: FormData) => Promise<ReviewInvitationActionState>;
  revokeAction: (state: ReviewInvitationActionState) => Promise<ReviewInvitationActionState>;
  initialStatus: ReviewInvitationStatus | null;
  patientHasEmail: boolean;
}) {
  const [issueState, issueFormAction, issuePending] = useActionState(issueAction, {});
  const [emailState, emailFormAction, emailPending] = useActionState(emailAction, {});
  const [revokeState, revokeFormAction, revokePending] = useActionState(revokeAction, {});
  const [copied, setCopied] = useState(false);
  const effectiveStatus = revokeState.status ?? emailState.status ?? issueState.status ?? initialStatus;
  const active = effectiveStatus === "pending" || effectiveStatus === "sent";
  const url = issueState.url;
  return <section className="glass-card mt-6 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-ink">Solicitud de reseña</h2><p className="mt-1 text-sm text-slate-600">Genera un enlace personal, expirable y de un solo uso.</p></div>{effectiveStatus ? <Badge variant={variants[effectiveStatus]}>{labels[effectiveStatus]}</Badge> : null}</div>
    <div className="mt-4 flex flex-wrap gap-3">
      <form action={issueFormAction}><Button type="submit" disabled={issuePending || effectiveStatus === "completed"}><Link2 className="h-4 w-4" />{issuePending ? "Generando…" : active || effectiveStatus === "expired" || effectiveStatus === "revoked" ? "Regenerar enlace" : "Solicitar reseña"}</Button></form>
      <Button type="button" variant="secondary" disabled={!url} onClick={() => { if (url) void navigator.clipboard.writeText(url).then(() => setCopied(true)); }}><Copy className="h-4 w-4" />{copied ? "Copiado" : "Copiar"}</Button>
      <form action={emailFormAction}><input type="hidden" name="review_url" value={url ?? ""} /><Button type="submit" variant="secondary" disabled={!url || !patientHasEmail || emailPending}><Mail className="h-4 w-4" />{emailPending ? "Enviando…" : "Enviar email"}</Button></form>
      {active ? <form action={revokeFormAction}><Button type="submit" variant="secondary" disabled={revokePending}><XCircle className="h-4 w-4" />{revokePending ? "Revocando…" : "Revocar"}</Button></form> : null}
    </div>
    {!patientHasEmail ? <p className="mt-2 text-xs text-slate-500">El paciente no tiene correo registrado; puedes copiar el enlace.</p> : null}
    {url ? <div className="clinical-surface mt-4 p-3"><p className="break-all text-sm text-slate-700">{url}</p><p className="mt-1 text-xs text-slate-500">No será posible recuperar este enlace después de recargar.</p></div> : null}
    {[issueState, emailState, revokeState].map((state, index) => state.error ? <p key={`error-${index}`} role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p> : state.message ? <p key={`message-${index}`} role="status" className="mt-3 text-sm text-emerald-700">{state.message}</p> : null)}
  </section>;
}
