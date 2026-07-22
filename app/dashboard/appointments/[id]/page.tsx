import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Stethoscope,
  UserRound,
  Video
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { AppointmentStatusActions } from "@/components/appointments/appointment-status-actions";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  formatAppointmentCreatedAt,
  formatAppointmentDetailDateTime,
  getAppointmentDetailAgendaHref,
  getAppointmentDetailMessage,
  getAppointmentDetailStatusVariant,
  getSafeAppointmentMeetingUrl,
  type AppointmentDetailSearchParams
} from "@/lib/appointments/detail";
import { canEditAppointments } from "@/lib/appointments/edit";
import { getAppointmentStatusLabel } from "@/lib/appointments/query";
import { getAvailableAppointmentStatusActions } from "@/lib/appointments/status";
import { getAppointmentDetailForActiveTenant } from "@/lib/server/appointment-detail";

export const dynamic = "force-dynamic";

function AppointmentDetailUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <Link
        href="/dashboard/appointments"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la agenda
      </Link>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No hay información disponible para mostrar en este momento.</p>
      </section>
    </>
  );
}

function DetailItem({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 p-4">
      <dt className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default async function AppointmentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<AppointmentDetailSearchParams>;
}) {
  const { id } = await params;
  const [result, query] = await Promise.all([
    getAppointmentDetailForActiveTenant(id),
    searchParams
  ]);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");

  if (result.state === "no_active_membership") {
    return (
      <AppointmentDetailUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para consultar esta cita."
      />
    );
  }

  if (result.state === "error") {
    return (
      <AppointmentDetailUnavailable
        title="No fue posible cargar la cita"
        description="La información de la cita no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  const { appointment, patient, doctor, tenant } = result.data;
  const timeZone = tenant.clinic.timezone;
  const dateTime = formatAppointmentDetailDateTime(appointment.starts_at, appointment.ends_at, timeZone);
  const agendaHref = getAppointmentDetailAgendaHref(dateTime.localDate);
  const successMessage = getAppointmentDetailMessage(query);
  const meetingUrl = getSafeAppointmentMeetingUrl(appointment.meeting_url);
  const statusActions = getAvailableAppointmentStatusActions({
    currentStatus: appointment.status,
    role: tenant.membership.role,
    startsAt: appointment.starts_at,
    timeZone,
    hasAssignedDoctor: Boolean(appointment.doctor_id)
  });

  return (
    <>
      <Link
        href={agendaHref}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la agenda
      </Link>

      {successMessage ? (
        <p
          role="status"
          className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {successMessage}
        </p>
      ) : null}

      <PageHeader
        title="Detalle de la cita"
        description="Información administrativa de la cita dentro de la clínica activa."
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge variant={getAppointmentDetailStatusVariant(appointment.status)}>
              {getAppointmentStatusLabel(appointment.status)}
            </Badge>
            <h1 className="mt-4 break-words text-2xl font-bold text-ink sm:text-3xl">{appointment.title}</h1>
            <p className="mt-2 text-sm text-slate-500">Zona horaria: {timeZone}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {canEditAppointments(tenant.membership.role) ? (
              <ButtonLink
                href={`/dashboard/appointments/${appointment.id}/edit`}
                variant="secondary"
                className="shrink-0"
              >
                <Pencil className="h-4 w-4" />
                Editar cita
              </ButtonLink>
            ) : null}
            {patient ? (
              <ButtonLink href={`/dashboard/patients/${patient.id}`} className="shrink-0">
                <UserRound className="h-4 w-4" />
                Ver paciente
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem icon={<UserRound className="h-4 w-4 text-clinic" />} label="Paciente">
            {patient ? (
              <Link href={`/dashboard/patients/${patient.id}`} className="text-clinic hover:underline">
                {patient.full_name}
              </Link>
            ) : (
              "Sin registro"
            )}
          </DetailItem>
          <DetailItem icon={<Stethoscope className="h-4 w-4 text-clinic" />} label="Profesional">
            {doctor?.display_name ?? "Sin registro"}
          </DetailItem>
          <DetailItem icon={<CalendarDays className="h-4 w-4 text-clinic" />} label="Fecha">
            <span className="capitalize">{dateTime.dateLabel}</span>
          </DetailItem>
          <DetailItem icon={<Clock className="h-4 w-4 text-clinic" />} label="Horario">
            {dateTime.startsLabel} - {dateTime.endsLabel} ({dateTime.durationLabel})
          </DetailItem>
          <DetailItem icon={<CalendarDays className="h-4 w-4 text-clinic" />} label="Tipo de cita">
            {appointment.appointment_type ?? "Sin registro"}
          </DetailItem>
          <DetailItem icon={<MapPin className="h-4 w-4 text-clinic" />} label="Ubicación">
            {appointment.location ?? (meetingUrl ? "En línea" : "Sin registro")}
          </DetailItem>
          <DetailItem icon={<CalendarDays className="h-4 w-4 text-clinic" />} label="Fecha de creación">
            {formatAppointmentCreatedAt(appointment.created_at, timeZone)}
          </DetailItem>
          <DetailItem icon={<Video className="h-4 w-4 text-clinic" />} label="Videollamada">
            {meetingUrl ? (
              <a
                href={meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-clinic hover:underline"
              >
                Abrir enlace
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "Sin registro"
            )}
          </DetailItem>
        </dl>
      </section>

      <AppointmentStatusActions
        appointmentId={appointment.id}
        currentStatus={appointment.status}
        actions={statusActions}
      />
    </>
  );
}
