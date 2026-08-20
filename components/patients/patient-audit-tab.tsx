import Link from "next/link";
import { History } from "lucide-react";
import { formatPatientTimestamp } from "@/lib/patients/detail";
import type { PatientAuditEvent } from "@/lib/server/patient-audit";

export function PatientAuditTab({ events, timeZone }: { events: PatientAuditEvent[]; timeZone: string }) {
  return <section className="surface-card p-4 sm:p-5">
    <div><h2 className="flex items-center gap-2 text-lg font-bold"><History className="h-5 w-5 text-clinic" />Auditoría del paciente</h2><p className="mt-1 text-sm text-slate-500">Vista segura para owner y admin. Solo muestra la acción, el recurso, el actor legítimo y la fecha.</p></div>
    <ol className="mt-5 grid gap-3">
      {events.length ? events.map((event) => <li key={event.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-ink">{event.actionLabel}</p><Link href={event.resourceHref} className="mt-1 inline-flex min-h-8 items-center text-sm font-semibold text-clinic hover:underline">{event.resourceLabel}</Link><p className="mt-1 text-sm text-slate-500">Actor: {event.actorName ?? "Sistema"}</p></div><time className="text-sm text-slate-500" dateTime={event.occurredAt}>{formatPatientTimestamp(event.occurredAt, timeZone)}</time></div></li>) : <li className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">No hay eventos de auditoría registrados para este paciente.</li>}
    </ol>
  </section>;
}
