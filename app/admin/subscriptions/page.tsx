import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { formatAdminDate, parseAdminSubscriptionQuery, planLabels, subscriptionStatusLabels, tenantTypeLabels, type AdminSearchParams } from "@/lib/admin/query";
import { getPlatformAdminSubscriptions } from "@/lib/server/platform-admin";

function subscriptionVariant(status: string) {
  if (status === "active") return "green" as const;
  if (status === "trialing") return "teal" as const;
  if (status === "past_due") return "amber" as const;
  return "slate" as const;
}

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const query = parseAdminSubscriptionQuery(await searchParams);
  const result = await getPlatformAdminSubscriptions(query);
  return (
    <>
      <div className="mb-6"><p className="text-sm font-semibold uppercase text-clinic">Administración de plataforma</p><h1 className="mt-1 text-2xl font-bold tracking-normal text-ink">Suscripciones</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Billing SaaS real por clínica. No incluye pagos clínicos, tarjetas, credenciales ni payloads del proveedor.</p></div>
      <form className="filter-toolbar mb-5 grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-[13rem_13rem_15rem_auto] xl:items-end"><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Plan</span><Select name="plan" defaultValue={query.plan ?? ""}><option value="">Todos</option>{Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Estado</span><Select name="status" defaultValue={query.status ?? ""}><option value="">Todos</option>{Object.entries(subscriptionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Origen de billing</span><Select name="provider" defaultValue={query.provider ?? ""}><option value="">Todos</option><option value="paypal">PayPal</option><option value="manual">Provisionamiento manual</option><option value="demo">Demo controlada</option></Select></label><Button type="submit">Aplicar filtros</Button></form>
      {result.state === "error" ? <section className="surface-card p-5" role="alert"><h2 className="font-bold text-ink">No fue posible cargar las suscripciones</h2><p className="mt-2 text-sm text-slate-600">Intenta nuevamente más tarde.</p></section> : (
        <section className="surface-card overflow-hidden">
          {result.data.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-semibold">Clínica</th><th className="px-5 py-3 font-semibold">Tipo</th><th className="px-5 py-3 font-semibold">Plan</th><th className="px-5 py-3 font-semibold">Estado</th><th className="px-5 py-3 font-semibold">Proveedor</th><th className="px-5 py-3 font-semibold">Periodo actual</th><th className="px-5 py-3 font-semibold">Alta</th></tr></thead><tbody className="divide-y divide-slate-200">{result.data.rows.map((subscription) => <tr key={subscription.id}><td className="px-5 py-4 font-semibold text-ink">{subscription.clinicName}</td><td className="px-5 py-4"><Badge variant={subscription.tenantType === "demo" ? "teal" : "slate"}>{tenantTypeLabels[subscription.tenantType]}</Badge></td><td className="px-5 py-4 text-slate-600">{planLabels[subscription.planId]}</td><td className="px-5 py-4"><Badge variant={subscriptionVariant(subscription.status)}>{subscriptionStatusLabels[subscription.status]}</Badge></td><td className="px-5 py-4 text-slate-600">{subscription.providerLabel}</td><td className="px-5 py-4 text-slate-600">{subscription.currentPeriodEnd ? `${subscription.cancelAtPeriodEnd ? "Finaliza" : "Renueva"}: ${formatAdminDate(subscription.currentPeriodEnd)}` : "Sin periodo registrado"}</td><td className="px-5 py-4 text-slate-600">{formatAdminDate(subscription.createdAt)}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><h2 className="font-bold text-ink">No se encontraron suscripciones</h2><p className="mt-2 text-sm text-slate-500">Ajusta los filtros para consultar otros registros de billing.</p></div>}
          <AdminPagination path="/admin/subscriptions" filters={{ plan: result.data.query.plan, status: result.data.query.status, provider: result.data.query.provider }} page={result.data.page} pageCount={result.data.pageCount} total={result.data.total} noun="suscripciones" />
        </section>
      )}
    </>
  );
}
