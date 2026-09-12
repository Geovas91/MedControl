"use client";

import { useState, useTransition } from "react";
import { assignSupportAction, replySupportAction, transitionSupportAction } from "@/app/admin/support/actions";
import { supportStatusLabels } from "@/lib/support/presentation";
import type { SupportTicketStatus } from "@/lib/support/types";
import { Button } from "@/components/ui/button";

const statusActions: Record<SupportTicketStatus, ReadonlyArray<{ status: SupportTicketStatus; label: string }>> = {
  open: [{ status: "triaged", label: "Pasar a triage" }],
  triaged: [{ status: "in_progress", label: "Iniciar atención" }],
  in_progress: [{ status: "waiting_user", label: "Esperando usuario" }, { status: "resolved", label: "Resolver" }],
  waiting_user: [{ status: "in_progress", label: "Reanudar atención" }],
  resolved: [{ status: "closed", label: "Cerrar ticket" }],
  closed: []
};

export function SupportAdminControls({ ticket, admins }: {
  ticket: { id: string; status: SupportTicketStatus; assigned_to: string | null };
  admins: Array<{ user_id: string }>;
}) {
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  function changeStatus(status: SupportTicketStatus) {
    setStatusError(null);
    start(async () => {
      try {
        const result = await transitionSupportAction(ticket.id, ticket.status, status);
        if (result.state !== "ready") {
          setStatusError(result.state === "invalid_transition"
            ? "El estado del ticket cambió. Actualiza la página e inténtalo de nuevo."
            : "No fue posible cambiar el estado. Inténtalo de nuevo.");
        }
      } catch {
        setStatusError("No fue posible cambiar el estado. Inténtalo de nuevo.");
      }
    });
  }

  return <section className="glass-card-strong p-5">
    <div role="group" aria-label="Estado del ticket" aria-busy={pending} className="flex flex-wrap items-center gap-2">
      <span role="status" className="glass-control px-3 py-1 text-sm font-semibold text-ink">Estado: {supportStatusLabels[ticket.status] ?? "No disponible"}</span>
      {(Object.hasOwn(statusActions, ticket.status) ? statusActions[ticket.status] : []).map(({ status, label }) =>
        <button type="button" disabled={pending} key={status} className="glass-control min-h-9 px-3 py-1 text-sm font-semibold text-ink disabled:opacity-55" onClick={() => changeStatus(status)}>{label}</button>
      )}
    </div>
    {statusError ? <p role="alert" className="mt-3 text-sm text-red-700">{statusError}</p> : null}
    <button type="button" disabled={pending} className="glass-control mt-3 min-h-9 px-3 py-1 text-sm font-semibold text-ink disabled:opacity-55" onClick={() => start(() => { void assignSupportAction(ticket.id, ticket.assigned_to ? null : admins[0]?.user_id ?? null); })}>{ticket.assigned_to ? "Desasignar" : "Asignarme"}</button>
    <form className={`mt-5 grid gap-3 rounded-[var(--radius-lg)] border p-4 ${internal ? "border-amber-300 bg-amber-50/90" : "border-teal-200 bg-teal-50/80"}`} onSubmit={e => { e.preventDefault(); start(() => { void replySupportAction(ticket.id, body, internal).then(() => setBody("")); }); }}>
      <textarea required value={body} onChange={e => setBody(e.target.value)} className="glass-input min-h-24 rounded-xl p-3 text-sm text-ink outline-none focus:border-clinic focus:ring-4 focus:ring-teal-100/80" placeholder={internal ? "Nota interna" : "Respuesta visible al tenant"} />
      <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Nota interna</label>
      <Button disabled={pending} className="w-fit">Guardar</Button>
    </form>
  </section>;
}
