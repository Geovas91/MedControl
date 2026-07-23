"use client";

import { useActionState, useState } from "react";
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
    await navigator.clipboard?.writeText(url);
    setCopied(true);
  }

  return (
    <Button type="button" variant="secondary" className="mt-3" onClick={copyLink} title="Copiar enlace de invitación">
      <Copy className="h-4 w-4" aria-hidden="true" />
      {copied ? "Enlace copiado" : "Copiar enlace"}
    </Button>
  );
}

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const [rotateState, rotateAction] = useActionState(rotateClinicInvitationAction, initialState);
  const [revokeState, revokeAction] = useActionState(revokeClinicInvitationAction, initialState);

  return (
    <div className="min-w-[180px]">
      <div className="flex gap-2">
        <form action={rotateAction}>
          <input type="hidden" name="invitation_id" value={invitationId} />
          <Button type="submit" variant="secondary" title="Generar un enlace nuevo">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Rotar
          </Button>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="invitation_id" value={invitationId} />
          <Button type="submit" variant="ghost" title="Revocar invitación">
            <X className="h-4 w-4" aria-hidden="true" />
            Revocar
          </Button>
        </form>
      </div>
      {rotateState.error || revokeState.error ? <p className="mt-2 text-xs text-rose-700">{rotateState.error ?? revokeState.error}</p> : null}
      {rotateState.message || revokeState.message ? <p className="mt-2 text-xs text-emerald-700">{rotateState.message ?? revokeState.message}</p> : null}
      {rotateState.invitationUrl ? <InvitationLink url={rotateState.invitationUrl} /> : null}
    </div>
  );
}
