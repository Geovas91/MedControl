import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { EditAppointmentForm } from "@/components/appointments/edit-appointment-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getAppointmentEditReturnHref } from "@/lib/appointments/edit";
import { getAppointmentEditForActiveTenant } from "@/lib/server/update-appointment";

export const dynamic = "force-dynamic";

function AppointmentEditUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No es posible mostrar el formulario en este momento.</p>
      </section>
    </>
  );
}

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAppointmentEditForActiveTenant(id);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");

  if (result.state === "no_active_membership") {
    return <AppointmentEditUnavailable title="Sin clínica activa" description="Tu cuenta no tiene una membresía activa para editar citas." />;
  }

  if (result.state === "forbidden") {
    return <AppointmentEditUnavailable title="Acceso de solo lectura" description="Tu rol actual puede consultar la agenda, pero no editar citas." />;
  }

  if (result.state === "error") {
    return <AppointmentEditUnavailable title="No fue posible preparar la cita" description="El formulario no está disponible temporalmente. Intenta nuevamente más tarde." />;
  }

  return (
    <>
      <Link href={getAppointmentEditReturnHref(result.data.initialValues.date)} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic">
        <ArrowLeft className="h-4 w-4" />
        Volver a la agenda
      </Link>
      <PageHeader title="Editar cita" description="Actualiza la información administrativa permitida dentro de la clínica activa." />
      <EditAppointmentForm appointmentId={result.data.appointment.id} initialValues={result.data.initialValues} patients={result.data.patients} doctors={result.data.doctors} timeZone={result.data.timeZone} />
    </>
  );
}
