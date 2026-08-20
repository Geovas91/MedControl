import Link from "next/link";
import { CalendarDays, FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { canCreateClinicalNote } from "@/lib/clinical-record/permissions";
import { getAppointmentStatusLabel } from "@/lib/appointments/query";
import { formatPatientTimestamp, getMedicalNoteStatusLabel } from "@/lib/patients/detail";
import type { ClinicalRecordData } from "@/lib/server/clinical-record";

function noteVariant(status: string) {
  return status === "finalized" ? "green" as const : status === "draft" ? "amber" as const : "slate" as const;
}

function appointmentVariant(status: string) {
  return status === "completed" ? "green" as const : status === "waiting" ? "amber" as const : status === "scheduled" || status === "confirmed" ? "teal" as const : "slate" as const;
}

export function PatientConsultationsTab({ data }: { data: ClinicalRecordData }) {
  const timeZone = data.tenant.clinic.timezone;
  const patientId = data.patient.id;
  return <div className="grid gap-4">
    <section className="surface-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5 text-clinic" />Notas clínicas</h2><p className="mt-1 text-sm text-slate-500">Registro clínico del paciente. Una nota puede estar vinculada a una cita, pero conserva su propia identidad clínica.</p></div>
        <div className="flex flex-wrap gap-2"><ButtonLink href={`/dashboard/patients/${patientId}/clinical-record`} variant="secondary">Ver expediente universal</ButtonLink>{canCreateClinicalNote(data.tenant.membership.role) ? <ButtonLink href={`/dashboard/patients/${patientId}/notes/new`}><Plus className="h-4 w-4" />Nueva nota</ButtonLink> : null}</div>
      </div>
      <div className="mt-5 grid gap-3">
        {data.notes.length ? data.notes.map((note) => <article key={note.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="font-semibold text-ink">{note.specialty ?? note.templateName ?? "Nota clínica"}</h3><p className="mt-1 text-sm text-slate-500">{formatPatientTimestamp(note.created_at, timeZone)} · {note.doctorName ?? "Profesional sin registro"}</p></div><Badge variant={noteVariant(note.status)}>{getMedicalNoteStatusLabel(note.status)}</Badge></div>
          <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{note.clinical_impression ?? "Sin resumen clínico disponible."}</p>
          <Link href={`/dashboard/patients/${patientId}/notes/${note.id}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-clinic hover:underline">Abrir detalle de la nota</Link>
        </article>) : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">No hay consultas registradas.</p>}
      </div>
      {data.pageCount > 1 ? <nav aria-label="Paginación de notas clínicas" className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold"><Link aria-disabled={data.page === 1} className={data.page === 1 ? "pointer-events-none text-slate-400" : "text-clinic hover:underline"} href={`/dashboard/patients/${patientId}?tab=consultas&page=${Math.max(1, data.page - 1)}`}>Anterior</Link><span className="text-slate-500">Página {data.page} de {data.pageCount}</span><Link aria-disabled={data.page === data.pageCount} className={data.page === data.pageCount ? "pointer-events-none text-slate-400" : "text-clinic hover:underline"} href={`/dashboard/patients/${patientId}?tab=consultas&page=${Math.min(data.pageCount, data.page + 1)}`}>Siguiente</Link></nav> : null}
    </section>

    <section className="surface-card p-4 sm:p-5">
      <div><h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-clinic" />Historial de citas</h2><p className="mt-1 text-sm text-slate-500">Agenda administrativa separada de las notas clínicas. Una cita no implica que exista una consulta documentada.</p></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {data.appointments.length ? data.appointments.map((appointment) => <article key={appointment.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-ink">{appointment.title}</h3><p className="mt-1 text-sm text-slate-500">{formatPatientTimestamp(appointment.starts_at, timeZone)}</p></div><Badge variant={appointmentVariant(appointment.status)}>{getAppointmentStatusLabel(appointment.status)}</Badge></div>
          <dl className="mt-3 grid gap-1 text-sm text-slate-600"><div><dt className="inline font-semibold">Profesional: </dt><dd className="inline">{appointment.doctorName ?? "Sin registro"}</dd></div><div><dt className="inline font-semibold">Tipo: </dt><dd className="inline">{appointment.appointment_type ?? "Sin registro"}</dd></div></dl>
          <Link href={`/dashboard/appointments/${appointment.id}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-clinic hover:underline">Abrir detalle de la cita</Link>
        </article>) : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500 md:col-span-2">No hay citas registradas.</p>}
      </div>
    </section>
  </div>;
}
