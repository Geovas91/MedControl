import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { formatAdminDate, memberRoleLabels, memberStatusLabels, parseAdminMembershipQuery, tenantTypeLabels, type AdminSearchParams } from "@/lib/admin/query";
import { getPlatformAdminMemberships } from "@/lib/server/platform-admin";

function membershipVariant(status: string) {
  if (status === "active") return "green" as const;
  if (status === "invited") return "amber" as const;
  return "slate" as const;
}

export default async function AdminDoctorsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const query = parseAdminMembershipQuery(await searchParams);
  const result = await getPlatformAdminMemberships(query);
  return (
    <>
      <div className="mb-6"><p className="text-sm font-semibold uppercase text-clinic">Administración de plataforma</p><h1 className="mt-1 text-2xl font-bold tracking-normal text-ink">Usuarios y membresías</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Cada fila representa una relación usuario-clínica. Un usuario multiclínica aparece una vez por membresía para conservar su rol y contexto reales.</p></div>
      <form className="filter-toolbar mb-5 grid gap-3 p-3 sm:grid-cols-[13rem_13rem_auto] sm:items-end"><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Rol en clínica</span><Select name="role" defaultValue={query.role ?? ""}><option value="">Todos</option>{Object.entries(memberRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Estado</span><Select name="status" defaultValue={query.status ?? ""}><option value="">Todos</option>{Object.entries(memberStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><Button type="submit">Aplicar filtros</Button></form>
      {result.state === "error" ? <section className="surface-card p-5" role="alert"><h2 className="font-bold text-ink">No fue posible cargar las membresías</h2><p className="mt-2 text-sm text-slate-600">Intenta nuevamente más tarde.</p></section> : (
        <section className="surface-card overflow-hidden">
          {result.data.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-semibold">Usuario</th><th className="px-5 py-3 font-semibold">Correo</th><th className="px-5 py-3 font-semibold">Clínica</th><th className="px-5 py-3 font-semibold">Tipo</th><th className="px-5 py-3 font-semibold">Rol</th><th className="px-5 py-3 font-semibold">Estado</th><th className="px-5 py-3 font-semibold">Alta en clínica</th></tr></thead><tbody className="divide-y divide-slate-200">{result.data.rows.map((membership) => <tr key={membership.id}><td className="px-5 py-4 font-semibold text-ink">{membership.fullName ?? "Nombre no registrado"}</td><td className="px-5 py-4 text-slate-600">{membership.email ?? "Correo no registrado"}</td><td className="px-5 py-4 text-slate-600">{membership.clinicName}</td><td className="px-5 py-4"><Badge variant={membership.tenantType === "demo" ? "teal" : "slate"}>{tenantTypeLabels[membership.tenantType]}</Badge></td><td className="px-5 py-4 text-slate-600">{memberRoleLabels[membership.role]}</td><td className="px-5 py-4"><Badge variant={membershipVariant(membership.status)}>{memberStatusLabels[membership.status]}</Badge></td><td className="px-5 py-4 text-slate-600">{formatAdminDate(membership.createdAt)}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><h2 className="font-bold text-ink">No se encontraron membresías</h2><p className="mt-2 text-sm text-slate-500">Ajusta los filtros para consultar otras relaciones usuario-clínica.</p></div>}
          <AdminPagination path="/admin/doctors" filters={{ role: result.data.query.role, status: result.data.query.status }} page={result.data.page} pageCount={result.data.pageCount} total={result.data.total} noun="membresías" />
        </section>
      )}
    </>
  );
}
