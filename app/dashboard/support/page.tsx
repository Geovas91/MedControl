import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, LifeBuoy, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateSupportTicketForm, SupportAssistantForm, SupportDiagnosticForm } from "@/components/support/support-forms";
import { getSupportArticleSummary } from "@/lib/support/articles";
import { supportCategoryLabels, supportSeverityLabels, supportStatusLabels, formatSupportDate } from "@/lib/support/presentation";
import { getSupportContext } from "@/lib/server/support/context";
import { listVisibleSupportArticles, searchVisibleSupportArticles } from "@/lib/server/support/articles";
import { listClinicSupportTickets, listMySupportTickets } from "@/lib/server/support/tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SupportPageProps = { searchParams: Promise<{ q?: string | string[] }> };
const frequentSlugs = ["crear-una-cita", "reprogramar-una-cita", "cancelar-una-cita", "conectar-google-calendar", "asistente-de-agenda"];

function TicketList({ title, tickets }: { title: string; tickets: NonNullable<Awaited<ReturnType<typeof listMySupportTickets>>["data"]> }) {
  return <section><h2 className="text-lg font-bold text-ink">{title}</h2>{tickets.length ? <div className="mt-3 grid gap-3">{tickets.map((ticket) => <Link key={ticket.id} href={`/dashboard/support/tickets/${ticket.id}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 shadow-xs transition hover:border-[var(--clinic-border)]">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink">{ticket.subject}</p><span className="font-mono text-xs text-[var(--foreground-muted)]">{ticket.referenceCode}</span></div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground-muted)]"><span>{supportCategoryLabels[ticket.category]}</span><span>Severidad: {supportSeverityLabels[ticket.severity]}</span><span>{supportStatusLabels[ticket.status]}</span><span>Actualizado {formatSupportDate(ticket.updatedAt)}</span></div>
  </Link>)}</div> : <p className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground-muted)]">No hay tickets en esta vista.</p>}</section>;
}
export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 160) : "";
  const context = await getSupportContext();
  if (context.state === "unauthenticated") redirect("/login");
  if (context.state === "no_active_membership") redirect("/onboarding");
  if (context.state !== "ready") return <><PageHeader title="Ayuda y soporte" description="Soporte técnico de CliniControl." /><p className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">Ayuda y soporte no está disponible temporalmente.</p></>;

  const [visibleResult, searchResult, myTicketsResult, clinicTicketsResult] = await Promise.all([
    listVisibleSupportArticles(), query ? searchVisibleSupportArticles(query) : Promise.resolve(null), listMySupportTickets(),
    context.context.role === "owner" || context.context.role === "admin" ? listClinicSupportTickets() : Promise.resolve(null)
  ]);
  const visible = visibleResult.state === "ready" ? visibleResult.data : [];
  const results = searchResult?.state === "ready" ? searchResult.data : [];
  const frequent = frequentSlugs.map((slug) => visible.find((article) => article.slug === slug)).filter((article) => article !== undefined);

  return <div className="grid gap-8">
    <section className="rounded-[var(--radius-lg)] border border-[var(--clinic-border)] bg-[var(--clinic-soft)] p-6 sm:p-8"><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-clinic text-white"><LifeBuoy className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold text-ink sm:text-3xl">Ayuda y soporte</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--foreground-soft)]">Soporte técnico para usar CliniControl. No brinda orientación médica. No incluyas nombres de pacientes, diagnósticos ni datos clínicos.</p></div></div></section>

    <section aria-labelledby="buscar-ayuda"><h2 id="buscar-ayuda" className="text-xl font-bold text-ink">Buscar en la base de conocimiento</h2><form className="mt-3 flex gap-2"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-3"><Search className="h-4 w-4 text-[var(--foreground-muted)]" /><span className="sr-only">¿En qué necesitas ayuda?</span><input name="q" defaultValue={query} maxLength={160} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="¿En qué necesitas ayuda?" /></label><button type="submit" className="rounded-[var(--radius-sm)] bg-clinic px-4 text-sm font-semibold text-white">Buscar</button></form>
      {query ? <div className="mt-4">{results.length ? <ul className="grid gap-3">{results.map((article) => <li key={article.slug}><Link href={`/dashboard/support/articles/${article.slug}`} className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 hover:border-[var(--clinic-border)]"><p className="font-semibold text-ink">{article.title}</p><p className="mt-1 text-sm text-[var(--foreground-muted)]">{getSupportArticleSummary(article)}</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-clinic">{article.category}</p></Link></li>)}</ul> : <p role="status" className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground-muted)]">No encontramos resultados publicados para esa búsqueda.</p>}</div> : null}
    </section>

    <section aria-labelledby="temas-frecuentes"><h2 id="temas-frecuentes" className="text-xl font-bold text-ink">Temas frecuentes</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{frequent.map((article) => <Link key={article.slug} href={`/dashboard/support/articles/${article.slug}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 shadow-xs hover:border-[var(--clinic-border)]"><BookOpen className="h-5 w-5 text-clinic" /><p className="mt-3 font-semibold text-ink">{article.title}</p><p className="mt-1 text-sm text-[var(--foreground-muted)]">{getSupportArticleSummary(article)}</p></Link>)}</div></section>

    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-5"><h2 className="text-xl font-bold text-ink">Asistente guiado</h2><p className="mb-4 mt-1 text-sm text-[var(--foreground-muted)]">Clasificación determinística; no es un chat ni usa inteligencia artificial.</p><SupportAssistantForm /></section><section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-5"><h2 className="text-xl font-bold text-ink">Diagnóstico seguro</h2><p className="mb-4 mt-1 text-sm text-[var(--foreground-muted)]">Sólo ejecuta comprobaciones permitidas y muestra estados generales.</p><SupportDiagnosticForm /></section></div>

    <section id="crear-ticket" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-5"><h2 className="text-xl font-bold text-ink">Crear ticket</h2><p className="mb-4 mt-1 text-sm text-[var(--foreground-muted)]">La severidad se calcula en el servidor según categoría e impacto.</p><CreateSupportTicketForm /></section>

    {myTicketsResult.state === "ready" ? <TicketList title="Mis tickets" tickets={myTicketsResult.data} /> : <p className="text-sm text-[var(--foreground-muted)]">No fue posible cargar tus tickets.</p>}
    {clinicTicketsResult?.state === "ready" ? <TicketList title="Tickets de la clínica" tickets={clinicTicketsResult.data} /> : null}
  </div>;
}
