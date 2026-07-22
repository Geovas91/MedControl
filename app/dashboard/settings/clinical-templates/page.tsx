import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { listClinicalTemplates } from "@/lib/server/clinical-templates";

export const dynamic = "force-dynamic";
export default async function ClinicalTemplatesPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const query = await searchParams;
  const kind = query.kind === "consent" ? "consent" : query.kind === "note" ? "note" : undefined;
  const active = query.status === "active" ? true : query.status === "inactive" ? false : undefined;
  const result = await listClinicalTemplates(kind, active);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "ready") return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No fue posible cargar las plantillas.</section>;
  return <><PageHeader title="Plantillas clinicas" description="Plantillas de notas y consentimientos de esta clinica." action={result.data.canManage ? { label: "Nueva plantilla", href: "/dashboard/settings/clinical-templates/new", icon: <Plus className="h-4 w-4" /> } : undefined} /><nav className="mb-5 flex flex-wrap gap-2 text-sm font-semibold"><Link href="/dashboard/settings/clinical-templates" className="rounded-md px-3 py-2 text-clinic hover:bg-teal-50">Todas</Link><Link href="/dashboard/settings/clinical-templates?kind=note" className="rounded-md px-3 py-2 text-clinic hover:bg-teal-50">Notas</Link><Link href="/dashboard/settings/clinical-templates?kind=consent" className="rounded-md px-3 py-2 text-clinic hover:bg-teal-50">Consentimientos</Link><Link href="/dashboard/settings/clinical-templates?status=active" className="rounded-md px-3 py-2 text-clinic hover:bg-teal-50">Activas</Link><Link href="/dashboard/settings/clinical-templates?status=inactive" className="rounded-md px-3 py-2 text-clinic hover:bg-teal-50">Inactivas</Link></nav><section className="grid gap-3">{result.data.templates.length ? result.data.templates.map((template) => <Link key={template.id} href={`/dashboard/settings/clinical-templates/${template.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-ink">{template.name}</p><p className="mt-1 text-sm text-slate-500">{template.description ?? template.specialty ?? "Sin descripcion"}</p></div><div className="flex gap-2"><Badge variant={template.template_kind === "consent" ? "teal" : "slate"}>{template.template_kind === "consent" ? "Consentimiento" : "Nota"}</Badge><Badge variant={template.is_active ? "green" : "amber"}>{template.is_active ? "Activa" : "Inactiva"}</Badge></div></div></Link>) : <p className="rounded-lg bg-white p-5 text-sm text-slate-500">No hay plantillas para este filtro.</p>}</section></>;
}
