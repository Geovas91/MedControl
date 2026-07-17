import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { CreateAppointmentForm } from "@/components/appointments/create-appointment-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getAppointmentCreationOptions } from "@/lib/server/create-appointment";

export const dynamic = "force-dynamic";

type NewAppointmentPageProps = {
  searchParams: Promise<{ patient?: string | string[] }>;
};

function AppointmentCreationUnavailable({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No es posible mostrar el formulario en este momento.</p>
      </section>
    </>
  );
}

export default async function NewAppointmentPage({ searchParams }: NewAppointmentPageProps) {
  const params = await searchParams;
  const requestedPatientId = typeof params.patient === "string" ? params.patient : undefined;
  const result = await getAppointmentCreationOptions(requestedPatientId);

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    return (
      <AppointmentCreationUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para crear citas."
      />
    );
  }

  if (result.state === "forbidden") {
    return (
      <AppointmentCreationUnavailable
        title="Acceso de solo lectura"
        description="Tu rol actual puede consultar la agenda, pero no crear citas."
      />
    );
  }

  if (result.state === "error") {
    return (
      <AppointmentCreationUnavailable
        title="No fue posible preparar la cita"
        description="El formulario no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  return (
    <>
      <Link
        href="/dashboard/appointments"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la agenda
      </Link>
      <PageHeader
        title="Crear cita"
        description="Programa una cita real para un paciente y médico de la clínica activa."
      />
      <CreateAppointmentForm
        patients={result.data.patients}
        doctors={result.data.doctors}
        preselectedPatientId={result.data.preselectedPatientId}
        clinicToday={result.data.clinicToday}
        timeZone={result.data.timeZone}
      />
    </>
  );
}
