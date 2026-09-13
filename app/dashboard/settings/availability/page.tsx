import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfessionalAvailabilityForm } from "@/components/settings/professional-availability-form";
import { getProfessionalAvailability } from "@/lib/server/professional-availability";
export const dynamic = "force-dynamic";
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const selected = typeof params.professional === "string" ? params.professional : undefined; const result = await getProfessionalAvailability(selected);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_eligible") return <><PageHeader title="Disponibilidad profesional" description="Configura el horario recurrente de consulta."/><section className="glass-card-strong p-5 text-sm text-slate-600">No hay profesionales elegibles para configurar.</section></>;
  if (result.state !== "ready" || !result.data) return <><PageHeader title="Disponibilidad profesional" description="Configura el horario recurrente de consulta."/><section className="glass-card-strong p-5 text-sm text-rose-700">No fue posible cargar la disponibilidad.</section></>;
  return <><PageHeader title="Disponibilidad profesional" description={`Horario recurrente de ${result.data.clinic.name}.`}/><ProfessionalAvailabilityForm data={result.data}/></>;
}
