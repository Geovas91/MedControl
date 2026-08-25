import { Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatAdminDate, parseAdminClinicQuery, planLabels, subscriptionStatusLabels, tenantTypeLabels, type AdminSearchParams } from "@/lib/admin/query";
import { getPlatformAdminClinics } from "@/lib/server/platform-admin";

function subscriptionVariant(status: string | null) {
  if (status === "active") return "green" as const;
  if (status === "trialing") return "teal" as const;
  if (status === "past_due") return "amber" as const;
  return "slate" as const;
}

export default async function AdminClinicsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const query = parseAdminClinicQuery(await searchParams);
  const result = await getPlatformAdminClinics(query);

  return (
    <>
      <div className="mb-6"><p className="text-sm font-semibold uppercase text-clinic">Administración de plataforma</p><h1 className="mt-1 text-2xl font-bold tracking-normal text-ink">Clínicas</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Tenants reales, suscripciones y conteos administrativos de membresías. No permite abrir expedientes clínicos.</p></div>
      <form className="filter-toolbar mb-5 grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Buscar clínica</span><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input name="q" defaultValue={query.search} placeholder="Nombre de clínica" className="w-full pl-10" /></span></label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Tipo de tenant</span><Select name="tenant" defaultValue={query.tenantType ?? ""} className="w-full"><option value="">Todos</option>{Object.entries(tenantTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <Button type="submit">Aplicar filtros</Button>
      </form>
      {result.state === "error" ? (
        <section className="surface-card p-5" role="alert"><h2 className="font-bold text-ink">No fue posible cargar las clínicas</h2><p className="mt-2 text-sm text-slate-600">Intenta nuevamente más tarde.</p></section>
      ) : (
        <section className="surface-card overflow-hidden">
          {result.data.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-semibold">Clínica</th><th className="px-5 py-3 font-semibold">Tipo</th><th className="px-5 py-3 font-semibold">Plan</th><th className="px-5 py-3 font-semibold">Estado de suscripción</th><th className="px-5 py-3 font-semibold">Membresías</th><th className="px-5 py-3 font-semibold">Fecha de alta</th></tr></thead><tbody className="divide-y divide-slate-200">{result.data.rows.map((clinic) => <tr key={clinic.id}><td className="px-5 py-4 font-semibold text-ink">{clinic.name}</td><td className="px-5 py-4"><Badge variant={clinic.tenantType === "demo" ? "teal" : "slate"}>{tenantTypeLabels[clinic.tenantType]}</Badge></td><td className="px-5 py-4 text-slate-600">{clinic.planId ? planLabels[clinic.planId] : "Sin suscripción"}</td><td className="px-5 py-4"><Badge variant={subscriptionVariant(clinic.subscriptionStatus)}>{clinic.subscriptionStatus ? subscriptionStatusLabels[clinic.subscriptionStatus] : "Sin registro"}</Badge></td><td className="px-5 py-4 text-slate-600">{clinic.memberCount}</td><td className="px-5 py-4 text-slate-600">{formatAdminDate(clinic.createdAt)}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><h2 className="font-bold text-ink">No se encontraron clínicas</h2><p className="mt-2 text-sm text-slate-500">Ajusta la búsqueda o los filtros para ver otros tenants.</p></div>}
          <AdminPagination path="/admin/clinics" filters={{ q: result.data.query.search || null, tenant: result.data.query.tenantType }} page={result.data.page} pageCount={result.data.pageCount} total={result.data.total} noun="clínicas" />
        </section>
      )}
    </>
  );
}
