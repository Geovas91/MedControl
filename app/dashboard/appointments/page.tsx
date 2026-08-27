import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  MapPin,
  Pencil,
  Stethoscope,
  UserRound
} from "lucide-react";
import { redirect } from "next/navigation";
import { formatAppointmentDateLabel, formatAppointmentTimeRange } from "@/lib/appointments/format";
import { canCreateAppointments } from "@/lib/appointments/create";
import { canEditAppointments } from "@/lib/appointments/edit";
import {
  addDaysToAppointmentDate,
  buildAppointmentAgendaHref,
  getAppointmentStatusLabel,
  type AppointmentPeriod,
  type AppointmentQuery,
  type AppointmentSearchParams,
  type AppointmentStatus
} from "@/lib/appointments/query";
import { AppointmentAgendaFilters } from "@/components/appointments/appointment-agenda-filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAppointmentAgendaForActiveTenant } from "@/lib/server/appointments";

export const dynamic = "force-dynamic";

type AppointmentsPageProps = {
  searchParams: Promise<AppointmentSearchParams>;
};

function statusVariant(status: AppointmentStatus) {
  if (status === "completed") {
    return "green" as const;
  }

  if (status === "waiting") {
    return "amber" as const;
  }

  if (status === "scheduled" || status === "confirmed") {
    return "teal" as const;
  }

  return "slate" as const;
}

function AppointmentsUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No hay datos disponibles para mostrar en este momento.</p>
      </section>
    </>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

function periodLabel(query: AppointmentQuery) {
  const labels: Record<Exclude<AppointmentPeriod, "month" | "range">, string> = {
    day: `día ${shortDate(query.date)}`,
    upcoming: "próximas citas",
    past: "citas pasadas",
    all: "todas las citas"
  };
  if (query.period === "month") {
    return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${query.date.slice(0, 7)}-01T12:00:00.000Z`));
  }
  if (query.period === "range") return query.from && query.to ? `${shortDate(query.from)}–${shortDate(query.to)}` : "rango personalizado";
  return labels[query.period];
}

function rangeErrorMessage(query: AppointmentQuery) {
  if (query.rangeError === "reversed") return "La fecha Desde debe ser anterior o igual a Hasta.";
  if (query.rangeError === "too_long") return "El rango personalizado no puede superar 366 días.";
  if (query.rangeError === "missing_or_invalid") return "Selecciona fechas válidas para Desde y Hasta.";
  return null;
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const result = await getAppointmentAgendaForActiveTenant(await searchParams);

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    return (
      <AppointmentsUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para consultar la agenda."
      />
    );
  }

  if (result.state === "error") {
    return (
      <AppointmentsUnavailable
        title="No fue posible cargar la agenda"
        description="La información de las citas no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  const { data } = result;
  const timeZone = data.tenant.clinic.timezone;
  const previousDate = addDaysToAppointmentDate(data.query.date, -1);
  const nextDate = addDaysToAppointmentDate(data.query.date, 1);
  const activePeriod = periodLabel(data.query);
  const rangeError = rangeErrorMessage(data.query);
  const metricsUseVisibleFilters = Boolean(data.query.status || data.query.doctor || data.query.search);
  const totals = [
    { label: "Total", value: data.totals.total },
    { label: "Programadas / confirmadas", value: data.totals.scheduledOrConfirmed },
    { label: "En espera", value: data.totals.waiting },
    { label: "Completadas", value: data.totals.completed },
    { label: "Canceladas", value: data.totals.cancelled }
  ];

  return (
    <>
      <PageHeader
        title="Agenda diaria"
        description="Consulta citas del tenant activo por día, mes, histórico, próximas o rango personalizado."
        action={
          canCreateAppointments(data.tenant.membership.role)
            ? {
                label: "Nueva cita",
                href: "/dashboard/appointments/new",
                icon: <CalendarPlus className="h-4 w-4" />
              }
            : undefined
        }
      />

      {data.updated || data.created ? (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {data.updated ? "La cita se actualizó correctamente." : "La cita se creó correctamente."}
        </p>
      ) : null}

      {data.query.dateWasNormalized ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          La fecha solicitada no era válida. Se muestra la fecha actual de la clínica.
        </p>
      ) : null}

      {data.query.filtersWereNormalized ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Uno o más filtros no eran válidos para esta clínica y se descartaron de forma segura.
        </p>
      ) : null}

      {rangeError ? (
        <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{rangeError}</p>
      ) : null}

      <section className="surface-card mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha de la agenda</p>
            <h2 className="mt-1 text-lg font-bold capitalize text-ink">
              {formatAppointmentDateLabel(data.query.date)}
            </h2>
            <p className="mt-1 break-words text-xs text-slate-500">{timeZone}</p>
          </div>
          <div className="grid w-full gap-3 md:w-auto">
          <nav className="grid grid-cols-3 gap-2" aria-label="Navegación por fecha">
            <Link
              href={buildAppointmentAgendaHref(data.query, { date: previousDate, period: "day", from: null, to: null, page: 1 })}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Link>
            <Link
              href={buildAppointmentAgendaHref(data.query, { date: data.clinicToday, period: "day", from: null, to: null, page: 1 })}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <CalendarDays className="h-4 w-4" />
              Hoy
            </Link>
            <Link
              href={buildAppointmentAgendaHref(data.query, { date: nextDate, period: "day", from: null, to: null, page: 1 })}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="period" value="day" />
            {data.query.status ? <input type="hidden" name="status" value={data.query.status} /> : null}
            {data.query.doctor ? <input type="hidden" name="doctor" value={data.query.doctor} /> : null}
            {data.query.search ? <input type="hidden" name="q" value={data.query.search} /> : null}
            <label className="grid flex-1 gap-1 text-xs font-semibold text-slate-600">
              <span>Seleccionar fecha</span>
              <Input type="date" name="date" defaultValue={data.query.date} required />
            </label>
            <Button type="submit" variant="secondary">Ir a fecha</Button>
          </form>
          </div>
        </div>
      </section>

      <AppointmentAgendaFilters query={data.query} doctors={data.doctors} />

      <section aria-label="Totales del periodo">
        <p className="mb-3 text-xs text-slate-500">
          Totales de {activePeriod}. {metricsUseVisibleFilters ? "Incluyen búsqueda, estado y médico activos." : "Sin filtros adicionales."}
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {totals.map((total) => (
            <div key={total.label} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">{total.label}</p>
              <p className="mt-2 text-2xl font-bold text-ink">{total.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card mt-5 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-ink">Periodo activo: <span className="capitalize">{activePeriod}</span></p>
          <p>{data.filteredTotal ? `Mostrando ${data.visibleFrom}–${data.visibleTo} de ${data.filteredTotal}` : "Sin resultados"}</p>
        </div>
        <div className="grid gap-4">
          {data.appointments.map((appointment) => {
            const time = formatAppointmentTimeRange(appointment.starts_at, appointment.ends_at, timeZone);
            const location = appointment.location ?? (appointment.meeting_url ? "En línea" : "Sin registro");

            return (
              <article
                key={appointment.id}
                className="grid min-w-0 gap-4 rounded-md border border-slate-200 p-4 lg:grid-cols-[10rem_minmax(0,1fr)_auto] lg:items-center"
              >
                <div>
                  <p className="mb-1 text-xs font-semibold capitalize text-slate-500">
                    {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone }).format(new Date(appointment.starts_at))}
                  </p>
                  <p className="flex items-center gap-2 font-bold text-ink">
                    <Clock className="h-4 w-4 shrink-0 text-clinic" />
                    {time.starts} - {time.ends}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{time.durationLabel}</p>
                </div>
                <div className="min-w-0">
                  <h2 className="break-words font-bold text-ink">{appointment.title}</h2>
                  <div className="mt-2 grid gap-1 text-sm text-slate-500 sm:grid-cols-2">
                    <Link
                      href={`/dashboard/patients/${appointment.patient_id}`}
                      className="inline-flex min-w-0 items-center gap-2 font-semibold text-clinic hover:underline"
                    >
                      <UserRound className="h-4 w-4 shrink-0" />
                      <span className="truncate">{appointment.patientName}</span>
                    </Link>
                    <p className="inline-flex min-w-0 items-center gap-2">
                      <Stethoscope className="h-4 w-4 shrink-0" />
                      <span className="truncate">{appointment.doctorName ?? "Sin registro"}</span>
                    </p>
                    <p className="inline-flex min-w-0 items-center gap-2">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span className="truncate">{appointment.appointment_type ?? "Sin registro"}</span>
                    </p>
                    <p className="inline-flex min-w-0 items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{location}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <Badge variant={statusVariant(appointment.status)} className="w-fit">
                    {getAppointmentStatusLabel(appointment.status)}
                  </Badge>
                  <Link
                    href={`/dashboard/appointments/${appointment.id}`}
                    className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                    Ver detalle
                  </Link>
                  {canEditAppointments(data.tenant.membership.role) ? (
                    <Link href={`/dashboard/appointments/${appointment.id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-clinic ring-1 ring-teal-200 hover:bg-teal-50">
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}

          {data.appointments.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 px-5 py-12 text-center text-sm text-slate-500">
              {rangeError ? "Corrige el rango para consultar citas." : "No hay citas que coincidan con el periodo y los filtros actuales."}
            </div>
          ) : null}
        </div>
        {data.pageCount > 1 ? (
          <nav className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de citas">
            <p className="text-sm text-slate-600">Página {data.page} de {data.pageCount}</p>
            <div className="flex gap-2">
              {data.page > 1 ? <Link href={buildAppointmentAgendaHref(data.query, { page: data.page - 1 })} className="inline-flex h-10 items-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />Anterior</Link> : null}
              {data.page < data.pageCount ? <Link href={buildAppointmentAgendaHref(data.query, { page: data.page + 1 })} className="inline-flex h-10 items-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Siguiente<ChevronRight className="h-4 w-4" /></Link> : null}
            </div>
          </nav>
        ) : null}
      </section>

      <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        Las invitaciones de calendario no deben incluir información clínica sensible.
      </section>
    </>
  );
}
