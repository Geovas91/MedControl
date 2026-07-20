import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { CreatePatientForm } from "@/components/patients/create-patient-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getPatientCreationOptions } from "@/lib/server/create-patient";

export const dynamic = "force-dynamic";

function PatientCreationUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No es posible mostrar el formulario en este momento.</p>
      </section>
    </>
  );
}

export default async function NewPatientPage() {
  const result = await getPatientCreationOptions();

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    return (
      <PatientCreationUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para crear pacientes."
      />
    );
  }

  if (result.state === "forbidden") {
    return (
      <PatientCreationUnavailable
        title="Acceso de solo lectura"
        description="Tu rol actual puede consultar pacientes, pero no crear registros."
      />
    );
  }

  if (result.state === "error") {
    return (
      <PatientCreationUnavailable
        title="No fue posible preparar el paciente"
        description="El formulario no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  return (
    <>
      <Link
        href="/dashboard/patients"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a pacientes
      </Link>
      <PageHeader
        title="Crear paciente"
        description="Registra un paciente real dentro de la clínica activa."
      />
      <CreatePatientForm doctors={result.data.doctors} clinicToday={result.data.clinicToday} />
    </>
  );
}
