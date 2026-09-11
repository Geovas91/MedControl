import Link from "next/link";
import { CalendarDays, CreditCard, UsersRound, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatMxnCurrency, getAgendaState } from "@/lib/dashboard/metrics";
import { formatClinicTime } from "@/lib/dashboard/timezone";
import { getDashboardOverview, type DashboardAgendaItem } from "@/lib/server/dashboard";

export const dynamic = "force-dynamic";

const appointmentStatusLabels: Record<DashboardAgendaItem["status"], string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  waiting: "En espera",
  completed: "Completada",
  cancelled: "Cancelada"
};

function statusVariant(status: DashboardAgendaItem["status"]) {
  if (status === "completed") {
    return "green" as const;
  }

  if (status === "waiting") {
    return "amber" as const;
  }

  if (status === "cancelled") {
    return "red" as const;
  }

  return "teal" as const;
}

function DashboardUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="surface-card p-5">
        <p className="text-sm text-slate-600">No hay datos disponibles para mostrar en este momento.</p>
      </section>
    </>
  );
}

export default async function DashboardPage() {
  const result = await getDashboardOverview();

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    return (
      <DashboardUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para mostrar información del dashboard."
      />
    );
  }

  if (result.state === "error") {
    return (
      <DashboardUnavailable
        title="No fue posible cargar el resumen"
        description="La información de la clínica no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  const { data } = result;
  const agendaState = getAgendaState(data.appointmentsToday);

  return (
    <>
      <PageHeader eyebrow="Panel clínico" title="Resumen de clínica" description="Vista rápida de la actividad de hoy, pacientes y flujo de pagos." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <StatCard
          label="Pacientes"
          value={`${data.patientCount}`}
          detail="Registros del tenant activo"
          icon={<UsersRound className="h-5 w-5" />}
        />
        <StatCard
          label="Citas activas"
          value={`${data.appointmentsToday.filter((appointment) => ["scheduled", "confirmed", "waiting"].includes(appointment.status)).length}`}
          detail={`Pendientes de atención hoy (${data.localDate})`}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <StatCard
          label="Ingresos"
          value={formatMxnCurrency(data.paidMxn)}
          detail="Pagos cobrados totales en MXN"
          icon={<WalletCards className="h-5 w-5" />}
        />
        <StatCard
          label="Pendiente"
          value={formatMxnCurrency(data.pendingMxn)}
          detail="Saldo pendiente total en MXN"
          icon={<CreditCard className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.28fr_0.72fr] xl:gap-6">
        <section className="glass-card-strong p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-clinic">Hoy</p><h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-ink">Agenda de hoy</h2></div><span className="glass-control inline-flex h-10 items-center px-3 text-xs font-semibold text-[var(--foreground-soft)]">{data.localDate}</span></div>
          <div className="mt-5 grid gap-3">
            {agendaState === "empty" ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-white/50 p-5 text-sm text-[var(--foreground-muted)]">
                No hay citas registradas para hoy en la zona horaria de la clínica.
              </div>
            ) : (
              data.appointmentsToday.map((appointment) => (
                <div
                  key={appointment.id}
                className="clinical-surface flex flex-col gap-3 p-3.5 transition duration-150 hover:-translate-y-px hover:border-[var(--clinic-border)] hover:bg-white/90 hover:shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-4"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {formatClinicTime(appointment.startsAt, data.tenant.clinic.timezone)} · {appointment.patientName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                      <Link
                        href={`/dashboard/appointments/${appointment.id}`}
                        className="font-medium text-ink hover:text-clinic hover:underline"
                      >
                        {appointment.title}
                      </Link>
                      {appointment.appointmentType ? ` · ${appointment.appointmentType}` : ""}
                    </p>
                  </div>
                  <Badge variant={statusVariant(appointment.status)}>{appointmentStatusLabels[appointment.status]}</Badge>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-clinic">Resumen</p>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-ink">Actividad reciente</h2>
          <div className="clinical-surface mt-5 border-dashed p-5">
            <p className="text-sm leading-6 text-[var(--foreground-muted)]">No hay una fuente de actividad reciente disponible.</p>
          </div>
        </section>
      </div>
    </>
  );
}
