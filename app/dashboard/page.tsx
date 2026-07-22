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
    return "slate" as const;
  }

  return "teal" as const;
}

function DashboardUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
      <PageHeader title="Resumen de clínica" description="Vista rápida de la actividad de hoy, pacientes y flujo de pagos." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pacientes"
          value={`${data.patientCount}`}
          detail="Registros del tenant activo"
          icon={<UsersRound className="h-5 w-5" />}
        />
        <StatCard
          label="Citas"
          value={`${data.appointmentsToday.length}`}
          detail={`Registradas hoy (${data.localDate})`}
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-bold text-ink">Agenda de hoy</h2>
          <div className="mt-4 grid gap-3">
            {agendaState === "empty" ? (
              <div className="rounded-md border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                No hay citas registradas para hoy en la zona horaria de la clínica.
              </div>
            ) : (
              data.appointmentsToday.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {formatClinicTime(appointment.startsAt, data.tenant.clinic.timezone)} · {appointment.patientName}
                    </p>
                    <p className="text-sm text-slate-500">
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

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Actividad reciente</h2>
          <div className="mt-4 rounded-md bg-slate-50 p-4">
            <p className="text-sm text-slate-500">No hay una fuente de actividad reciente disponible.</p>
          </div>
        </section>
      </div>
    </>
  );
}
