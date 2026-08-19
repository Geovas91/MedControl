import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPatientConsentsHref } from "@/lib/consents/navigation";
import { buildPatientListHref, normalizePatientListQuery, type PatientListSearchParams } from "@/lib/patients/query";
import { getPatientsForActiveTenant } from "@/lib/server/patients";

export const dynamic = "force-dynamic";

function ConsentsUnavailable({ title, description }: { title: string; description: string }) {
  return <><PageHeader title={title} description={description} /><section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">No hay pacientes disponibles para mostrar en este momento.</p></section></>;
}

export default async function ConsentsPage({ searchParams }: { searchParams: Promise<PatientListSearchParams> }) {
  const params = await searchParams;
  const query = normalizePatientListQuery({ q: params.q, page: params.page, pageSize: "10" });
  const result = await getPatientsForActiveTenant(query);

  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") return <ConsentsUnavailable title="Sin clínica activa" description="Tu cuenta no tiene una membresía activa para consultar consentimientos." />;
  if (result.state === "error") return <ConsentsUnavailable title="No fue posible cargar los pacientes" description="La información de la clínica no está disponible temporalmente. Intenta nuevamente más tarde." />;

  const { data } = result;
  return <>
    <PageHeader title="Consentimientos" description="Selecciona un paciente para crear, revisar o gestionar sus consentimientos." />
    <section aria-labelledby="select-consent-patient-title" className="surface-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 id="select-consent-patient-title" className="text-lg font-bold text-ink">Seleccionar paciente</h2><p className="mt-1 text-sm text-slate-500">Elige el expediente donde deseas gestionar consentimientos.</p></div>
        <form className="flex w-full max-w-md gap-2">
          <label className="sr-only" htmlFor="consent-patient-search">Buscar paciente</label>
          <span className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="consent-patient-search" name="q" defaultValue={query.search} placeholder="Buscar por nombre o identificador" className="w-full pl-10" /></span>
          <Button type="submit">Buscar</Button>
        </form>
      </div>
      <p className="py-3 text-sm text-slate-600">{data.filteredTotal} {data.filteredTotal === 1 ? "paciente disponible" : "pacientes disponibles"}</p>
      <div className="divide-y divide-slate-200 border-t border-slate-200">
        {data.patients.map((patient) => <article key={patient.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="truncate font-semibold text-ink">{patient.full_name}</h3><p className="font-mono text-xs text-slate-500">{patient.internal_identifier}</p></div></div>
          <ButtonLink href={buildPatientConsentsHref(patient.id)} variant="secondary" className="shrink-0">Ver consentimientos</ButtonLink>
        </article>)}
        {data.patients.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{data.totalPatients === 0 ? "Esta clínica todavía no tiene pacientes." : "No hay pacientes que coincidan con la búsqueda."}</p> : null}
      </div>
    </section>
    {data.filteredTotal > 0 ? <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginación de pacientes para consentimientos"><p className="text-sm text-slate-600">Página {data.page} de {data.pageCount}</p><div className="flex gap-2">{data.page > 1 ? <Link href={buildPatientListHref(query, data.page - 1, "/dashboard/consents")} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />Anterior</Link> : null}{data.page < data.pageCount ? <Link href={buildPatientListHref(query, data.page + 1, "/dashboard/consents")} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Siguiente<ChevronRight className="h-4 w-4" /></Link> : null}</div></nav> : null}
  </>;
}
