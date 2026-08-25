import { Building2, CreditCard, FlaskConical, Stethoscope, UsersRound } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatAdminDate, planLabels, subscriptionStatusLabels, tenantTypeLabels } from "@/lib/admin/query";
import { getPlatformAdminOverview } from "@/lib/server/platform-admin";

const metricIcons = [Building2, FlaskConical, UsersRound, Stethoscope, CreditCard];

export default async function AdminHomePage() {
  const result = await getPlatformAdminOverview();

  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase text-clinic">Administración de plataforma</p>
        <h1 className="mt-1 text-2xl font-bold tracking-normal text-ink">Resumen administrativo</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Métricas operativas de tenants, membresías y suscripciones. Esta vista no consulta contenido clínico.</p>
      </div>

      {result.state === "error" ? (
        <section className="surface-card p-5" role="alert"><h2 className="font-bold text-ink">No fue posible cargar el resumen</h2><p className="mt-2 text-sm text-slate-600">Los datos administrativos no están disponibles temporalmente.</p></section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Métricas de plataforma">
            {result.data.metrics.map((metric, index) => {
              const Icon = metricIcons[index] ?? Building2;
              return <StatCard key={metric.label} label={metric.label} value={String(metric.value)} detail={metric.detail} icon={<Icon className="h-5 w-5" />} />;
            })}
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="surface-card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-ink">Altas recientes</h2><p className="mt-1 text-sm text-slate-500">Últimas clínicas registradas, sin información de pacientes.</p></div>
              {result.data.recentClinics.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-semibold">Clínica</th><th className="px-5 py-3 font-semibold">Tipo</th><th className="px-5 py-3 font-semibold">Plan / estado</th><th className="px-5 py-3 font-semibold">Alta</th></tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {result.data.recentClinics.map((clinic) => (
                        <tr key={clinic.id}>
                          <td className="px-5 py-4 font-semibold text-ink">{clinic.name}</td>
                          <td className="px-5 py-4"><Badge variant={clinic.tenantType === "demo" ? "teal" : "slate"}>{tenantTypeLabels[clinic.tenantType]}</Badge></td>
                          <td className="px-5 py-4 text-slate-600">{clinic.planId ? `${planLabels[clinic.planId]} · ${subscriptionStatusLabels[clinic.subscriptionStatus ?? "inactive"]}` : "Sin suscripción registrada"}</td>
                          <td className="px-5 py-4 text-slate-600">{formatAdminDate(clinic.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="p-5 text-sm text-slate-500">Todavía no hay clínicas registradas.</p>}
            </article>

            <aside className="surface-card p-5">
              <h2 className="text-lg font-bold text-ink">Distribución de planes</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Conteos exactos de suscripciones registradas.</p>
              <dl className="mt-4 grid gap-3">
                {result.data.planDistribution.map((item) => <div key={item.planId} className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-3"><dt className="text-sm font-medium text-slate-700">{planLabels[item.planId]}</dt><dd className="text-lg font-bold text-ink">{item.total}</dd></div>)}
              </dl>
              <h2 className="mt-6 border-t border-slate-200 pt-5 text-lg font-bold text-ink">Estados de suscripción</h2>
              <dl className="mt-4 grid gap-3">
                {result.data.statusDistribution.map((item) => <div key={item.status} className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-3"><dt className="text-sm font-medium text-slate-700">{subscriptionStatusLabels[item.status]}</dt><dd className="text-lg font-bold text-ink">{item.total}</dd></div>)}
              </dl>
            </aside>
          </section>
        </>
      )}
    </>
  );
}
