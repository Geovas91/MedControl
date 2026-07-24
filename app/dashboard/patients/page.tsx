import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  buildPatientListHref,
  formatPatientBirthDate,
  getPatientStatusLabel,
  normalizePatientListQuery,
  patientPageSizes,
  patientStatuses,
  type PatientListSearchParams,
  type PatientStatus
} from "@/lib/patients/query";
import { getPatientsForActiveTenant } from "@/lib/server/patients";

export const dynamic = "force-dynamic";

type PatientsPageProps = {
  searchParams: Promise<PatientListSearchParams>;
};

function statusVariant(status: PatientStatus) {
  if (status === "active") {
    return "green" as const;
  }

  if (status === "follow_up") {
    return "amber" as const;
  }

  return "slate" as const;
}

function PatientsUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No hay datos disponibles para mostrar en este momento.</p>
      </section>
    </>
  );
}

export default async function PatientsPage({ searchParams }: PatientsPageProps) {
  const query = normalizePatientListQuery(await searchParams);
  const result = await getPatientsForActiveTenant(query);

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    return (
      <PatientsUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para consultar pacientes."
      />
    );
  }

  if (result.state === "error") {
    return (
      <PatientsUnavailable
        title="No fue posible cargar los pacientes"
        description="La información de la clínica no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  const { data } = result;
  const hasFilters = Boolean(query.search || query.status);

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Busca, revisa y prepara expedientes antes de cada visita."
        action={
          data.canCreate
            ? { label: "Nuevo paciente", href: "/dashboard/patients/new", icon: <Plus className="h-4 w-4" /> }
            : undefined
        }
      />

      <form className="filter-toolbar mb-5 grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Buscar pacientes</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              name="q"
              defaultValue={query.search}
              placeholder="Nombre, teléfono o email"
              className="w-full pl-10"
            />
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Estado</span>
          <Select name="status" defaultValue={query.status ?? ""} className="w-full">
            <option value="">Todos</option>
            {patientStatuses.map((status) => (
              <option key={status} value={status}>
                {getPatientStatusLabel(status)}
              </option>
            ))}
          </Select>
        </label>
        <input type="hidden" name="pageSize" value={data.pageSize} />
        <Button type="submit">Aplicar filtros</Button>
      </form>

      <div className="mb-3 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {data.filteredTotal} {data.filteredTotal === 1 ? "resultado" : "resultados"} de {data.totalPatients} pacientes
        </p>
        <form className="flex items-center gap-2">
          {query.search ? <input type="hidden" name="q" value={query.search} /> : null}
          {query.status ? <input type="hidden" name="status" value={query.status} /> : null}
          <label htmlFor="patient-page-size" className="font-medium">
            Por página
          </label>
          <Select
            id="patient-page-size"
            name="pageSize"
            defaultValue={data.pageSize}
            className="h-9 w-20"
            aria-label="Pacientes por página"
          >
            {patientPageSizes.map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" className="h-9 px-3">
            Cambiar
          </Button>
        </form>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="hidden grid-cols-[1.2fr_1fr_0.8fr_0.6fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <span>Paciente</span>
          <span>Contacto</span>
          <span>Nacimiento</span>
          <span>Estado</span>
        </div>
        <div className="divide-y divide-slate-200">
          {data.patients.map((patient) => (
            <Link
              key={patient.id}
              href={`/dashboard/patients/${patient.id}`}
              aria-label={`Ver detalle de ${patient.full_name}`}
              className="grid gap-4 px-4 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-clinic sm:px-5 lg:grid-cols-[1.2fr_1fr_0.8fr_0.6fr] lg:items-center lg:gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{patient.full_name}</p>
                  <p className="text-sm text-slate-500">{patient.sex || "Sexo sin registro"}</p>
                </div>
              </div>
              <div className="min-w-0 grid gap-1 text-sm text-slate-600">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Contacto</p>
                <p>{patient.phone || "Sin teléfono"}</p>
                <p className="break-all">{patient.email || "Sin correo"}</p>
              </div>
              <div className="text-sm text-slate-600">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Nacimiento</p>
                <p>{formatPatientBirthDate(patient.date_of_birth)}</p>
              </div>
              <Badge variant={statusVariant(patient.status)} className="w-fit">
                {getPatientStatusLabel(patient.status)}
              </Badge>
            </Link>
          ))}

          {data.patients.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {data.totalPatients === 0 ? (
                <>
                  Esta clínica todavía no tiene pacientes.
                  {data.canCreate ? (
                    <Link href="/dashboard/patients/new" className="ml-2 font-semibold text-clinic hover:underline">
                      Crear el primero
                    </Link>
                  ) : null}
                </>
              ) : (
                <>
                  No hay pacientes que coincidan con los filtros actuales.
                  {hasFilters ? (
                    <Link href="/dashboard/patients" className="ml-2 font-semibold text-clinic hover:underline">
                      Limpiar filtros
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {data.filteredTotal > 0 ? (
        <nav
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Paginación de pacientes"
        >
          <p className="text-sm text-slate-600">
            Página {data.page} de {data.pageCount}
          </p>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link
                href={buildPatientListHref(query, data.page - 1)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </span>
            )}
            {data.page < data.pageCount ? (
              <Link
                href={buildPatientListHref(query, data.page + 1)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </>
  );
}
