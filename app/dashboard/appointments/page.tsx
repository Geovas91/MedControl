import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Search,
  Stethoscope,
  UserRound
} from "lucide-react";
import { redirect } from "next/navigation";
import { formatAppointmentDateLabel, formatAppointmentTimeRange } from "@/lib/appointments/format";
import { canCreateAppointments } from "@/lib/appointments/create";
import {
  addDaysToAppointmentDate,
  appointmentStatuses,
  buildAppointmentAgendaHref,
  getAppointmentStatusLabel,
  type AppointmentSearchParams,
  type AppointmentStatus
} from "@/lib/appointments/query";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
  const hasFilters = Boolean(data.query.status || data.query.doctor || data.query.search);
  const previousDate = addDaysToAppointmentDate(data.query.date, -1);
  const nextDate = addDaysToAppointmentDate(data.query.date, 1);
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
        description="Consulta las citas reales del tenant activo por fecha, paciente, médico y estado."
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

      {data.created ? (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          La cita se creó correctamente.
        </p>
      ) : null}

      {data.query.dateWasNormalized ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          La fecha solicitada no era válida. Se muestra la fecha actual de la clínica.
        </p>
      ) : null}

      <section className="mb-5 border-y border-slate-200 bg-white py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha de la agenda</p>
            <h2 className="mt-1 text-lg font-bold capitalize text-ink">
              {formatAppointmentDateLabel(data.query.date)}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{timeZone}</p>
          </div>
          <nav className="grid grid-cols-3 gap-2" aria-label="Navegación por fecha">
            <Link
              href={buildAppointmentAgendaHref(data.query, previousDate)}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Link>
            <Link
              href={buildAppointmentAgendaHref(data.query, data.clinicToday)}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <CalendarDays className="h-4 w-4" />
              Hoy
            </Link>
            <Link
              href={buildAppointmentAgendaHref(data.query, nextDate)}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </section>

      <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_14rem_auto] xl:items-end">
        <input type="hidden" name="date" value={data.query.date} />
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              name="q"
              defaultValue={data.query.search}
              placeholder="Paciente o título"
              className="w-full pl-10"
            />
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Estado</span>
          <Select name="status" defaultValue={data.query.status ?? ""} className="w-full">
            <option value="">Todos</option>
            {appointmentStatuses.map((status) => (
              <option key={status} value={status}>
                {getAppointmentStatusLabel(status)}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Médico</span>
          <Select name="doctor" defaultValue={data.query.doctor ?? ""} className="w-full">
            <option value="">Todos</option>
            {data.doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit">Aplicar filtros</Button>
      </form>

      <section aria-label="Totales del día">
        <p className="mb-3 text-xs text-slate-500">Los totales representan el día completo, sin aplicar filtros.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {totals.map((total) => (
            <div key={total.label} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">{total.label}</p>
              <p className="mt-2 text-2xl font-bold text-ink">{total.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
                <Badge variant={statusVariant(appointment.status)} className="w-fit">
                  {getAppointmentStatusLabel(appointment.status)}
                </Badge>
              </article>
            );
          })}

          {data.appointments.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 px-5 py-12 text-center text-sm text-slate-500">
              {data.totals.total === 0
                ? "No hay citas registradas para este día."
                : "Hay citas este día, pero ninguna coincide con los filtros actuales."}
              {hasFilters ? (
                <Link
                  href={buildAppointmentAgendaHref({
                    ...data.query,
                    status: null,
                    doctor: null,
                    search: ""
                  })}
                  className="ml-2 font-semibold text-clinic hover:underline"
                >
                  Limpiar filtros
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        Las invitaciones de calendario no deben incluir información clínica sensible.
      </section>
    </>
  );
}
