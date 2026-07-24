"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Copy, RefreshCw, X } from "lucide-react";
import {
  revokeClinicInvitationAction,
  rotateClinicInvitationAction,
  type InvitationActionState
} from "@/app/dashboard/members/actions";
import { Button } from "@/components/ui/button";

const initialState: InvitationActionState = {};

function InvitationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3"><input readOnly aria-label="Enlace de invitación para copiar" value={url} className="w-full rounded border border-slate-200 bg-white p-2 text-xs" onFocus={(event) => event.currentTarget.select()} /><Button type="button" variant="secondary" className="mt-2" onClick={copyLink} title="Copiar enlace de invitación"><Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Enlace copiado" : "Copiar enlace"}</Button>{!copied ? <p className="mt-2 text-xs text-slate-500">Si no puedes copiarlo con el botón, selecciónalo en el campo.</p> : null}</div>
  );
}

function InvitationActionButton({ kind }: { kind: "rotate" | "revoke" }) {
  const { pending } = useFormStatus();
  const rotate = kind === "rotate";
  return <Button type="submit" variant={rotate ? "secondary" : "ghost"} disabled={pending} title={rotate ? "Generar un enlace nuevo" : "Revocar invitación"}>{rotate ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}{pending ? "Enviando..." : rotate ? "Generar enlace nuevo" : "Revocar"}</Button>;
}

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const [rotateState, rotateAction] = useActionState(rotateClinicInvitationAction, initialState);
  const [revokeState, revokeAction] = useActionState(revokeClinicInvitationAction, initialState);

  return (
    <div className="min-w-[180px]">
      <div className="flex gap-2">
        <form action={rotateAction}>
          <input type="hidden" name="invitation_id" value={invitationId} />
          <InvitationActionButton kind="rotate" />
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="invitation_id" value={invitationId} />
          <InvitationActionButton kind="revoke" />
        </form>
      </div>
      {rotateState.error || revokeState.error ? <p aria-live="polite" className="mt-2 text-xs text-rose-700">{rotateState.error ?? revokeState.error}</p> : null}
      {rotateState.message || revokeState.message ? <p aria-live="polite" className="mt-2 text-xs text-emerald-700">{rotateState.message ?? revokeState.message}</p> : null}
      {rotateState.invitationUrl ? <InvitationLink url={rotateState.invitationUrl} /> : null}
    </div>
  );
}
