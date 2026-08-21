import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, UserRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClinicalNoteAction } from "@/app/dashboard/patients/[id]/notes/new/actions";
import { ClinicalNoteForm } from "@/components/clinical-record/clinical-note-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPatientListHref, normalizePatientListQuery, type PatientListSearchParams } from "@/lib/patients/query";
import { getClinicalNoteFormOptions, getClinicalNotePatientSelection } from "@/lib/server/clinical-notes";

export const dynamic = "force-dynamic";

type NewMedicalNoteSearchParams = PatientListSearchParams & { patientId?: string | string[] };

function CreationUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <Link href="/dashboard/medical-notes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a notas médicas</Link>
      <PageHeader title={title} description={description} />
      <section className="surface-card p-5"><p className="text-sm text-slate-600">No es posible iniciar una nota clínica en este momento.</p></section>
    </>
  );
}

export default async function NewMedicalNotePage({ searchParams }: { searchParams: Promise<NewMedicalNoteSearchParams> }) {
  const params = await searchParams;
  const patientId = typeof params.patientId === "string" ? params.patientId : null;

  if (patientId) {
    const result = await getClinicalNoteFormOptions(patientId);
    if (result.state === "invalid_id" || result.state === "not_found") notFound();
    if (result.state === "unauthenticated") redirect("/login");
    if (result.state === "no_active_membership") redirect("/onboarding");
    if (result.state !== "ready") return <CreationUnavailable title="Creación restringida" description="Tu rol o la suscripción actual no permiten crear notas clínicas." />;

    const action = createClinicalNoteAction.bind(null, result.data.patient.id);
    return (
      <>
        <Link href="/dashboard/medical-notes/new" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Elegir otro paciente</Link>
        <PageHeader title="Nueva nota clínica" description={`Registra una nota en borrador para ${result.data.patient.full_name}.`} />
        <ClinicalNoteForm action={action} initialValues={{ specialty: "", clinicalImpression: "", content: "", appointmentId: "", templateId: "", expectedUpdatedAt: "" }} templates={result.data.templates} appointments={result.data.appointments} timeZone={result.data.timeZone} cancelHref="/dashboard/medical-notes" />
      </>
    );
  }

  const query = normalizePatientListQuery({ q: params.q, page: params.page, pageSize: "10" });
  const result = await getClinicalNotePatientSelection(query);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state === "forbidden") return <CreationUnavailable title="Creación restringida" description="Tu rol o la suscripción actual no permiten crear notas clínicas." />;
  if (result.state !== "ready") return <CreationUnavailable title="No fue posible cargar los pacientes" description="La información de la clínica no está disponible temporalmente. Intenta nuevamente más tarde." />;

  const { data } = result;
  return (
    <>
      <Link href="/dashboard/medical-notes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a notas médicas</Link>
      <PageHeader title="Nueva nota clínica" description="Selecciona un paciente real de la clínica activa para continuar." />
      <form className="filter-toolbar mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium text-slate-700">
          <span>Buscar paciente</span>
          <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input name="q" defaultValue={query.search} placeholder="Nombre, teléfono, correo o identificador" className="w-full pl-10" /></span>
        </label>
        <Button type="submit">Buscar</Button>
        {query.search ? <Link href="/dashboard/medical-notes/new" className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-white">Limpiar</Link> : null}
      </form>

      <p className="mb-3 text-sm text-slate-600">{data.filteredTotal} {data.filteredTotal === 1 ? "paciente disponible" : "pacientes disponibles"}</p>
      <section className="surface-card overflow-hidden">
        <div className="divide-y divide-slate-200">
          {data.patients.map((patient) => (
            <Link key={patient.id} href={`/dashboard/medical-notes/new?patientId=${encodeURIComponent(patient.id)}`} aria-label={`Crear nota clínica para ${patient.full_name}`} className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-clinic sm:px-5">
              <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic"><UserRound className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate font-semibold text-ink">{patient.full_name}</span><span className="block font-mono text-xs text-slate-500">{patient.internal_identifier}</span></span></span>
              <span className="shrink-0 text-sm font-semibold text-clinic">Seleccionar</span>
            </Link>
          ))}
          {data.patients.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500">{data.totalPatients === 0 ? "Esta clínica todavía no tiene pacientes." : <>No hay pacientes que coincidan con la búsqueda. <Link href="/dashboard/medical-notes/new" className="font-semibold text-clinic hover:underline">Limpiar búsqueda</Link></>}</div> : null}
        </div>
      </section>

      {data.filteredTotal > 0 ? (
        <nav className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación del selector de pacientes">
          <p className="text-sm text-slate-600">Página {data.page} de {data.pageCount}</p>
          <div className="flex gap-2">
            {data.page > 1 ? <Link href={buildPatientListHref(query, data.page - 1, "/dashboard/medical-notes/new")} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />Anterior</Link> : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400"><ChevronLeft className="h-4 w-4" />Anterior</span>}
            {data.page < data.pageCount ? <Link href={buildPatientListHref(query, data.page + 1, "/dashboard/medical-notes/new")} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Siguiente<ChevronRight className="h-4 w-4" /></Link> : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400">Siguiente<ChevronRight className="h-4 w-4" /></span>}
          </div>
        </nav>
      ) : null}
    </>
  );
}
