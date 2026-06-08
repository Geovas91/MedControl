import { CalendarDays, CreditCard, UsersRound, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { appointments, patients, payments } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const appointmentStatusLabels: Record<string, string> = {
  Completed: "Completada",
  Waiting: "En espera",
  Confirmed: "Confirmada"
};

export default function DashboardPage() {
  const paid = payments.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + payment.amount, 0);
  const pending = payments
    .filter((payment) => payment.status === "Pending")
    .reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <>
      <PageHeader title="Resumen de clínica" description="Vista rápida de la actividad de hoy, pacientes y flujo de pagos." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pacientes" value={`${patients.length}`} detail="Registro activo con datos de ejemplo" icon={<UsersRound className="h-5 w-5" />} />
        <StatCard label="Citas" value={`${appointments.length}`} detail="Programadas en la agenda de hoy" icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard label="Ingresos" value={formatCurrency(paid)} detail="Cobrado en visitas completadas" icon={<WalletCards className="h-5 w-5" />} />
        <StatCard label="Pendiente" value={formatCurrency(pending)} detail="Saldos abiertos por revisar" icon={<CreditCard className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-bold text-ink">Agenda de hoy</h2>
          <div className="mt-4 grid gap-3">
            {appointments.map((appointment) => (
              <div key={appointment.id} className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div>
                  <p className="font-semibold text-ink">{appointment.time} · {appointment.patientName}</p>
                  <p className="text-sm text-slate-500">{appointment.type} · {appointment.doctor}</p>
                </div>
                <Badge variant={appointment.status === "Completed" ? "green" : appointment.status === "Waiting" ? "amber" : "teal"}>
                  {appointmentStatusLabels[appointment.status] ?? appointment.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Seguimientos de pacientes</h2>
          <div className="mt-4 grid gap-3">
            {patients.slice(0, 3).map((patient) => (
              <div key={patient.id} className="rounded-md bg-slate-50 p-4">
                <p className="font-semibold text-ink">{patient.name}</p>
                <p className="mt-1 text-sm text-slate-500">{patient.condition}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
