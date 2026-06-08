import { AlertTriangle, Building2, CreditCard, Stethoscope, UsersRound } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { adminStats } from "@/lib/admin/mock-admin-data";

const icons = [Building2, UsersRound, CreditCard, CreditCard, AlertTriangle];

export default function AdminHomePage() {
  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase text-clinic">Portal interno</p>
        <h1 className="mt-1 text-2xl font-bold tracking-normal text-ink">Resumen administrativo</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Vista inicial para supervisar operación, cuentas y suscripciones de la plataforma MedControl.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {adminStats.map((stat, index) => {
          const Icon = icons[index] ?? Stethoscope;

          return (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              detail={stat.detail}
              icon={<Icon className="h-5 w-5" />}
            />
          );
        })}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Actividad reciente</h2>
          <div className="mt-4 grid gap-3">
            {[
              "Nueva clínica en revisión: Centro Salud Sur Demo",
              "Suscripción con pago pendiente: Consultorio Vida Demo",
              "Solicitud de soporte abierta por usuario demo"
            ].map((item) => (
              <div key={item} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
                <p className="text-sm text-slate-700">{item}</p>
                <Badge variant="amber">Revisar</Badge>
              </div>
            ))}
          </div>
        </article>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Notas de implementación</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Estos datos son mock. La conexión real a Supabase para métricas internas se implementará después de validar
            las políticas de `platform_admins` y los flujos de auditoría.
          </p>
        </aside>
      </section>
    </>
  );
}
