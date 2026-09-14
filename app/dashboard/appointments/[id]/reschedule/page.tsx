import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { RescheduleAppointmentForm } from "@/components/appointments/reschedule-appointment-form";
import { appointmentTimestampToLocalParts, getAppointmentEditReturnHref } from "@/lib/appointments/edit";
import { getAppointmentRescheduleForActiveTenant } from "@/lib/server/appointment-reschedule";

export const dynamic = "force-dynamic";

export default async function RescheduleAppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const result = await getAppointmentRescheduleForActiveTenant(id, query.date);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state === "forbidden") return <Unavailable title="Acceso de solo lectura" description="Tu rol actual no puede reprogramar esta cita." />;
  if (result.state !== "ready") return <Unavailable title="No fue posible cargar los horarios" description="Intenta nuevamente más tarde." />;
  const { data } = result;
  const current = appointmentTimestampToLocalParts(data.appointment.starts_at, data.timeZone);
  if (!current) return <Unavailable title="Horario inválido" description="No fue posible interpretar la zona horaria de la clínica." />;
  return <><Link href={`/dashboard/appointments/${id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver al detalle</Link><PageHeader title="Reprogramar cita" description={`Horario local de la clínica (${data.timeZone}).`} /><RescheduleAppointmentForm appointmentId={id} date={data.localDate} time={query.date === data.localDate ? current.time : data.localTime} status={data.appointment.status} slots={data.slots} returnHref={getAppointmentEditReturnHref(data.localDate)} /></>;
}

function Unavailable({ title, description }: { title: string; description: string }) { return <><PageHeader title={title} description={description} /><section className="glass-card-strong p-5"><p className="text-sm text-slate-600">No es posible mostrar el formulario en este momento.</p></section></>; }
