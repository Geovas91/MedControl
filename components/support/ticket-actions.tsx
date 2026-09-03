"use client";

import { useActionState } from "react";
import { addSupportTicketMessageAction, closeSupportTicketAction, type SupportFormActionState } from "@/app/dashboard/support/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";

const initialState: SupportFormActionState = { status: "idle" };

export function AddSupportTicketMessageForm({ ticketId }: { ticketId: string }) {
  const actionWithTicket = addSupportTicketMessageAction.bind(null, ticketId);
  const [state, action, pending] = useActionState(actionWithTicket, initialState);
  return <form action={action} className="grid gap-3">
    <Field label="Agregar respuesta" htmlFor="support-message"><Textarea id="support-message" name="message" required maxLength={4000} /></Field>
    <p className="text-xs text-[var(--foreground-muted)]">Sin archivos adjuntos. No incluyas datos de pacientes ni información clínica.</p>
    {state.message ? <p role="status" className="text-sm text-[var(--danger)]">{state.message}</p> : null}
    <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar respuesta"}</Button>
  </form>;
}
export function CloseSupportTicketForm({ ticketId, fromStatus }: { ticketId: string; fromStatus: string }) {
  const actionWithTicket = closeSupportTicketAction.bind(null, ticketId, fromStatus);
  const [state, action, pending] = useActionState(actionWithTicket, initialState);
  return <form action={action} className="grid gap-2">
    <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Cerrando…" : "Cerrar como resuelto"}</Button>
    {state.message ? <p role="status" className="text-sm text-[var(--danger)]">{state.message}</p> : null}
  </form>;
}
