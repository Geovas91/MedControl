"use client";

import { Copy, Link2, RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";

export function ConsentSigningLinkControls({ action, revokeAction, hasActiveLink }: { action: (state: { error?: string; url?: string; expiresAt?: string }, formData: FormData) => Promise<{ error?: string; url?: string; expiresAt?: string }>; revokeAction: () => Promise<void>; hasActiveLink: boolean }) {
  const [state, formAction] = useActionState(action, {});
  const [copied, setCopied] = useState(false);
  return <section className="mt-6 rounded-md border border-slate-200 p-4"><h2 className="font-bold text-ink">Enlace de firma</h2><p className="mt-2 text-sm text-slate-600">Este enlace permite revisar y firmar el consentimiento. Compartelo unicamente con el paciente correspondiente.</p><div className="mt-4 flex flex-wrap gap-3"><form action={formAction}><Button type="submit"><Link2 className="h-4 w-4" />{hasActiveLink ? "Regenerar enlace" : "Generar enlace de firma"}</Button></form>{hasActiveLink ? <form action={revokeAction}><Button type="submit" variant="secondary"><RotateCcw className="h-4 w-4" />Revocar enlace</Button></form> : null}</div>{state.url ? <div className="mt-4 rounded-md bg-teal-50 p-3"><p className="break-all text-sm text-slate-700">{state.url}</p><Button type="button" variant="ghost" className="mt-2" onClick={() => { void navigator.clipboard.writeText(state.url!); setCopied(true); }}><Copy className="h-4 w-4" />{copied ? "Copiado" : "Copiar enlace"}</Button></div> : null}{state.error ? <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p> : null}</section>;
}
