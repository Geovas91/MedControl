import Link from "next/link";
import { Activity, CalendarClock, CalendarDays, CheckCircle2, Mail, MessageSquareOff, Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { AppointmentAssistantSettings } from "@/components/bot/appointment-assistant-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  hasAppointmentAssistantSavedMessage,
  hasAppointmentAssistantSettingsError,
  type AppointmentAssistantSearchParams
} from "@/lib/appointment-assistant";
import { getAppointmentStatusLabel, type AppointmentStatus } from "@/lib/appointments/query";
import { getAppointmentAssistantForActiveTenant } from "@/lib/server/appointment-assistant";

export const dynamic = "force-dynamic";

const activityLabels: Record<string, string> = {
  appointment_created: "Cita creada",
  appointment_confirmed: "Cita confirmada",
  appointment_waiting: "Paciente marcado en espera",
  appointment_completed: "Cita completada",
  appointment_cancelled: "Cita cancelada",
  appointment_restored: "Cita restaurada",
  appointment_rescheduled: "Cita reprogramada",
  calendar_invitation_sent: "Invitación de calendario enviada",
  calendar_invitation_failed: "Falló la invitación de calendario",
  calendar_invitation_delivery_unknown: "Entrega de invitación no confirmada"
};

function dateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(value));
}

function statusVariant(status: AppointmentStatus) {
  if (status === "completed") return "green" as const;
  if (status === "waiting") return "amber" as const;
  if (status === "cancelled") return "slate" as const;
  return "teal" as const;
}

function Unavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="surface-card p-5 text-sm text-slate-600">No hay información de agenda disponible.</section>
    </>
  );
}

export default async function BotPage({ searchParams }: { searchParams: Promise<AppointmentAssistantSearchParams> }) {
  const params = await searchParams;
  const result = await getAppointmentAssistantForActiveTenant(params);

  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") {
    return <Unavailable title="Sin clínica activa" description="Necesitas una membresía activa para consultar el asistente de agenda." />;
  }
  if (result.state === "error") {
    return <Unavailable title="No fue posible cargar el asistente" description="La agenda no está disponible temporalmente. Intenta nuevamente." />;
  }
  if (result.state !== "ready") {
    return <Unavailable title="Asistente no disponible" description="No fue posible resolver la agenda de la clínica activa." />;
  }

  const { data } = result;
  const olderActivityHref = data.activityNextCursor
    ? `/dashboard/bot?${new URLSearchParams({ activity_before: data.activityNextCursor.occurredAt, activity_before_id: data.activityNextCursor.eventId }).toString()}`
    : null;

  return (
    <>
      <PageHeader title="Asistente de agenda" description="Resumen operativo, preferencias internas y actividad comprobable de la agenda de la clínica activa." />

      {hasAppointmentAssistantSavedMessage(params) ? <p role="status" className="mb-5 rounded-[var(--radius-md)] bg-[var(--success-soft)] p-3 text-sm font-medium text-[var(--success)]">La configuración se guardó para esta clínica.</p> : null}
      {hasAppointmentAssistantSettingsError(params) ? <p role="alert" className="mb-5 rounded-[var(--radius-md)] bg-red-50 p-3 text-sm font-medium text-red-700">No fue posible guardar la configuración. Revisa los valores y tus permisos.</p> : null}

      <section className="surface-card mb-5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-ink"><Settings2 className="h-5 w-5 text-clinic" />Estado del asistente</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">CliniControl puede resumir la agenda, guardar preferencias y mostrar eventos reales. No existe un chatbot ni un proceso automático de recordatorios activo.</p>
          </div>
          <Badge variant={data.settings?.enabled ? "green" : "slate"}>{data.settings?.enabled ? "Preferencias habilitadas" : "Sin automatización activa"}</Badge>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Citas de hoy" value={`${data.totals.today}`} detail={`Fecha local ${data.localDate}`} icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard label="Próximas" value={`${data.totals.upcoming}`} detail="Activas durante los próximos 8 días" icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label="Confirmadas hoy" value={`${data.totals.confirmed}`} detail="Estado confirmado en la agenda real" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Completadas hoy" value={`${data.totals.completed}`} detail="Atenciones finalizadas en la fecha local" icon={<Activity className="h-5 w-5" />} />
      </div>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold text-ink">Agenda real</h2>
            <p className="mt-1 text-sm text-slate-500">Hoy: {data.totals.scheduled} programadas, {data.totals.confirmed} confirmadas, {data.totals.waiting} en espera, {data.totals.completed} completadas y {data.totals.cancelled} canceladas. CliniControl no tiene un estado no-show.</p>
          </div>
          <ButtonLink href="/dashboard/appointments" variant="secondary">Abrir agenda completa</ButtonLink>
        </div>
        <div className="mt-4 grid gap-3">
          {data.upcoming.length ? data.upcoming.map((appointment) => (
            <article key={appointment.id} className="clinical-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/dashboard/appointments/${appointment.id}`} className="font-semibold text-ink hover:text-clinic hover:underline">{appointment.title}</Link>
                <p className="mt-1 text-sm text-slate-500">{appointment.patientName} · {dateTime(appointment.startsAt, data.tenant.clinic.timezone)}</p>
              </div>
              <Badge variant={statusVariant(appointment.status)}>{getAppointmentStatusLabel(appointment.status)}</Badge>
            </article>
          )) : <p className="rounded-[var(--radius-md)] border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No hay citas activas durante los próximos 8 días.</p>}
        </div>
        {data.totals.upcoming > data.upcoming.length ? <p className="mt-3 text-sm text-slate-500">Se muestran las primeras {data.upcoming.length} de {data.totals.upcoming}; el historial completo está en Citas.</p> : null}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AppointmentAssistantSettings settings={data.settings} canManage={data.canManageSettings} canWrite={data.canWriteSettings} />
        <section className="surface-card p-5">
          <h2 className="font-bold text-ink">Canales e integraciones</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-[var(--radius-md)] border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 font-semibold text-ink"><Mail className="h-4 w-4 text-clinic" />Email</span><Badge variant={data.emailCalendarChannel === "connected" ? "green" : "slate"}>{data.emailCalendarChannel === "connected" ? "Canal conectado" : "No configurado"}</Badge></div>
              <p className="mt-2 text-sm leading-6 text-slate-500">El canal existente envía invitaciones ICS al crear o cambiar citas. No ejecuta recordatorios programados.</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-semibold text-ink"><MessageSquareOff className="h-4 w-4 text-slate-500" />WhatsApp y SMS</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">No hay un proveedor conectado. Los canales externos estarán disponibles cuando se configure una integración real.</p>
            </div>
          </div>
        </section>
      </div>

      <section className="surface-card mt-5 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-ink"><Activity className="h-5 w-5 text-clinic" />Actividad real</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Citas registradas, cambios de agenda auditados y resultados reales del email de calendario. No contiene chats, respuestas ni mensajes inventados.</p>
        </div>
        <ol className="mt-4 grid gap-3">
          {data.activity.length ? data.activity.map((event) => (
            <li key={`${event.source}-${event.id}`} className="rounded-[var(--radius-md)] border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-ink">{activityLabels[event.action] ?? "Actividad de agenda"}</p>
                  <Link href={`/dashboard/appointments/${event.appointmentId}`} className="mt-1 inline-flex min-h-8 items-center text-sm font-semibold text-clinic hover:underline">{event.appointmentTitle}</Link>
                  <p className="text-sm text-slate-500">{event.patientName}</p>
                </div>
                <time dateTime={event.occurredAt} className="text-sm text-slate-500">{dateTime(event.occurredAt, data.tenant.clinic.timezone)}</time>
              </div>
            </li>
          )) : <li className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-5 text-center text-sm text-slate-500">No hay actividad de agenda registrada para esta clínica.</li>}
        </ol>
        {data.activityHasPrevious || olderActivityHref ? (
          <nav aria-label="Navegación de actividad del asistente" className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold">
            {data.activityHasPrevious ? <Link href="/dashboard/bot" className="text-clinic hover:underline">Volver a más reciente</Link> : <span />}
            {olderActivityHref ? <Link href={olderActivityHref} className="text-clinic hover:underline">Ver actividad anterior</Link> : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
