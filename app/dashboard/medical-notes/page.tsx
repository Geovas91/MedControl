import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  buildMedicalNotesListHref,
  medicalNoteStatuses,
  normalizeMedicalNotesListQuery,
  type MedicalNotesListSearchParams
} from "@/lib/medical-notes/query";
import { formatPatientTimestamp, getMedicalNoteStatusLabel } from "@/lib/patients/detail";
import { getGlobalClinicalNotesForActiveTenant } from "@/lib/server/clinical-notes";

export const dynamic = "force-dynamic";

function statusVariant(status: "draft" | "finalized" | "archived") {
  if (status === "finalized") return "green" as const;
  if (status === "draft") return "amber" as const;
  return "slate" as const;
}

function NotesUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="surface-card p-5">
        <p className="text-sm text-slate-600">No hay notas clínicas disponibles para mostrar en este momento.</p>
      </section>
    </>
  );
}

export default async function MedicalNotesPage({ searchParams }: { searchParams: Promise<MedicalNotesListSearchParams> }) {
  const query = normalizeMedicalNotesListQuery(await searchParams);
  const result = await getGlobalClinicalNotesForActiveTenant(query);

  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") {
    return <NotesUnavailable title="Sin clínica activa" description="Tu cuenta no tiene una membresía activa para consultar notas clínicas." />;
  }
  if (result.state === "forbidden") {
    return <NotesUnavailable title="Acceso clínico restringido" description="Tu rol actual no permite consultar notas clínicas." />;
  }
  if (result.state !== "ready") {
    return <NotesUnavailable title="No fue posible cargar las notas" description="La información clínica no está disponible temporalmente. Intenta nuevamente más tarde." />;
  }

  const { data } = result;
  return (
    <>
      <PageHeader
        title="Notas médicas"
        description="Consulta las notas clínicas reales de la clínica activa."
        action={data.canCreate ? { label: "Nueva nota", href: "/dashboard/medical-notes/new", icon: <Plus className="h-4 w-4" /> } : undefined}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <form className="filter-toolbar flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Estado</span>
            <Select name="status" defaultValue={query.status ?? ""} className="w-full sm:w-44">
              <option value="">Todos</option>
              {medicalNoteStatuses.map((status) => <option key={status} value={status}>{getMedicalNoteStatusLabel(status)}</option>)}
            </Select>
          </label>
          <Button type="submit">Aplicar filtro</Button>
          {query.status ? <ButtonLink href="/dashboard/medical-notes" variant="secondary">Limpiar</ButtonLink> : null}
        </form>
        <ButtonLink href="/dashboard/settings/clinical-templates?kind=note" variant="secondary">Ver plantillas clínicas</ButtonLink>
      </div>

      <p className="mb-3 text-sm text-slate-600">{data.total} {data.total === 1 ? "nota clínica" : "notas clínicas"}</p>
      <section className="surface-card overflow-hidden">
        <div className="hidden grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_0.7fr_0.7fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid">
          <span>Paciente</span><span>Profesional</span><span>Especialidad / plantilla</span><span>Fecha</span><span>Estado</span><span>Acción</span>
        </div>
        <div className="divide-y divide-slate-200">
          {data.notes.map((note) => (
            <article key={note.id} className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_0.7fr_0.7fr] xl:items-center">
              <div className="min-w-0">
                <Link href={`/dashboard/patients/${note.patient_id}`} className="font-semibold text-ink hover:text-clinic hover:underline">{note.patientName}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{note.clinical_impression ?? "Sin resumen clínico registrado"}</p>
              </div>
              <p className="text-sm text-slate-600">{note.doctorName ?? "Profesional sin registro"}</p>
              <div className="text-sm text-slate-600"><p>{note.specialty ?? "Sin especialidad"}</p><p className="mt-1 text-xs text-slate-500">{note.templateName ?? "Sin plantilla"}</p></div>
              <p className="text-sm text-slate-600">{formatPatientTimestamp(note.created_at, data.timeZone)}</p>
              <Badge variant={statusVariant(note.status)} className="w-fit">{getMedicalNoteStatusLabel(note.status)}</Badge>
              <Link href={`/dashboard/patients/${note.patient_id}/notes/${note.id}`} className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic"><Eye className="h-4 w-4" />Ver nota</Link>
            </article>
          ))}
          {data.notes.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {query.status ? <>No hay notas con el estado seleccionado. <Link href="/dashboard/medical-notes" className="font-semibold text-clinic hover:underline">Ver todas</Link></> : <>Esta clínica todavía no tiene notas clínicas.{data.canCreate ? <Link href="/dashboard/medical-notes/new" className="ml-2 font-semibold text-clinic hover:underline">Crear la primera</Link> : null}</>}
            </div>
          ) : null}
        </div>
      </section>

      {data.total > 0 ? (
        <nav className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de notas clínicas">
          <p className="text-sm text-slate-600">Página {data.page} de {data.pageCount}</p>
          <div className="flex gap-2">
            {data.page > 1 ? <Link href={buildMedicalNotesListHref(query, data.page - 1)} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />Anterior</Link> : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400"><ChevronLeft className="h-4 w-4" />Anterior</span>}
            {data.page < data.pageCount ? <Link href={buildMedicalNotesListHref(query, data.page + 1)} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Siguiente<ChevronRight className="h-4 w-4" /></Link> : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400">Siguiente<ChevronRight className="h-4 w-4" /></span>}
          </div>
        </nav>
      ) : null}
    </>
  );
}
