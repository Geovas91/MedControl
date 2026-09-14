import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfessionalAvailabilityForm } from "@/components/settings/professional-availability-form";
import { getProfessionalAvailability } from "@/lib/server/professional-availability";
import { getProfessionalExceptions } from "@/lib/server/professional-availability";
import { ProfessionalAvailabilityExceptions } from "@/components/settings/professional-availability-exceptions";
export const dynamic = "force-dynamic";
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const selected = typeof params.professional === "string" ? params.professional : undefined; const result = await getProfessionalAvailability(selected);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_eligible") return <><PageHeader title="Disponibilidad profesional" description="Configura el horario recurrente de consulta."/><section className="glass-card-strong p-5 text-sm text-slate-600">No hay profesionales elegibles para configurar.</section></>;
  if (result.state !== "ready" || !result.data) return <><PageHeader title="Disponibilidad profesional" description="Configura el horario recurrente de consulta."/><section className="glass-card-strong p-5 text-sm text-rose-700">No fue posible cargar la disponibilidad.</section></>;
  const exceptionResult = await getProfessionalExceptions(result.data.selectedProfessionalId);
  return <><PageHeader title="Disponibilidad profesional" description={`Horario recurrente de ${result.data.clinic.name}.`}/><div className="flex gap-2 border-b border-slate-200 pb-3 text-sm font-semibold"><span className="rounded-full bg-[var(--clinic-soft)] px-3 py-2 text-clinic">Horario semanal</span><span className="rounded-full bg-slate-100 px-3 py-2 text-slate-700">Excepciones y bloqueos</span></div><ProfessionalAvailabilityForm data={result.data}/><ProfessionalAvailabilityExceptions professionalId={result.data.selectedProfessionalId} canEdit={result.data.canEdit} timezone={result.data.clinic.timezone} exceptions={exceptionResult.data}/></>;
}
