import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AddSupportTicketMessageForm, CloseSupportTicketForm } from "@/components/support/ticket-actions";
import { formatSupportDate, supportCategoryLabels, supportSeverityLabels, supportStatusLabels } from "@/lib/support/presentation";
import { getSupportTicketDetail } from "@/lib/server/support/tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SupportTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; message?: string; closed?: string }> }) {
  const [{ id }, notices] = await Promise.all([params, searchParams]);
  const result = await getSupportTicketDetail(id);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state === "not_found" || result.state === "forbidden") notFound();
  if (result.state !== "ready") return <><PageHeader title="Ticket no disponible" description="No fue posible cargar el ticket en este momento." /></>;
  const { ticket, messages, events, canClose } = result.data;
  const timeline = [
    ...events.map((event) => ({ id: `event-${event.id}`, at: event.created_at, kind: "event" as const, event })),
    ...messages.map((message) => ({ id: `message-${message.id}`, at: message.created_at, kind: "message" as const, message }))
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return <div className="grid gap-6"><div><Link href="/dashboard/support" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground-soft)] hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a Ayuda y soporte</Link><PageHeader title={ticket.subject} description={`Ticket ${ticket.referenceCode}`} /></div>
    {notices.created === "1" ? <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Ticket creado correctamente.</p> : null}{notices.message === "added" ? <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Respuesta agregada.</p> : null}{notices.closed === "1" ? <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Ticket cerrado.</p> : null}
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-5"><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-[var(--foreground-muted)]">Estado</dt><dd className="font-semibold text-ink">{supportStatusLabels[ticket.status]}</dd></div><div><dt className="text-[var(--foreground-muted)]">Severidad</dt><dd className="font-semibold text-ink">{supportSeverityLabels[ticket.severity]}</dd></div><div><dt className="text-[var(--foreground-muted)]">Categoría</dt><dd className="font-semibold text-ink">{supportCategoryLabels[ticket.category]}</dd></div><div><dt className="text-[var(--foreground-muted)]">Creado</dt><dd className="font-semibold text-ink">{formatSupportDate(ticket.createdAt)}</dd></div></dl><div className="mt-5 border-t border-[var(--border)] pt-5"><h2 className="font-bold text-ink">Resumen</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-soft)]">{ticket.summary}</p></div></section>
    <section><h2 className="text-xl font-bold text-ink">Actividad</h2>{timeline.length ? <ol className="mt-3 grid gap-3">{timeline.map((item) => <li key={item.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4">{item.kind === "message" ? <><p className="text-xs font-semibold uppercase tracking-wide text-clinic">{item.message.author_kind === "platform_admin" ? "Equipo de soporte" : item.message.visibility === "clinic" ? "Miembro de la clínica" : "Solicitante"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-soft)]">{item.message.redacted_at ? "Mensaje retirado." : item.message.body}</p></> : <p className="text-sm text-[var(--foreground-soft)]">{item.event.event_type === "support_ticket_created" ? "Ticket creado" : item.event.event_type === "support_ticket_status_changed" && item.event.to_status ? `Estado actualizado a ${supportStatusLabels[item.event.to_status as keyof typeof supportStatusLabels] ?? "nuevo estado"}` : "Actividad registrada"}</p>}<time className="mt-2 block text-xs text-[var(--foreground-muted)]">{formatSupportDate(item.at)}</time></li>)}</ol> : <p className="mt-3 text-sm text-[var(--foreground-muted)]">Todavía no hay actividad visible.</p>}</section>
    {ticket.status !== "closed" ? <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-5"><AddSupportTicketMessageForm ticketId={ticket.id} /></section> : null}
    {canClose ? <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-5"><p className="mb-3 text-sm text-[var(--foreground-muted)]">Si la solución fue satisfactoria, puedes cerrar tu ticket.</p><CloseSupportTicketForm ticketId={ticket.id} fromStatus={ticket.status} /></section> : null}
  </div>;
}
