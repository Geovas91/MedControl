import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { EditPatientForm } from "@/components/patients/edit-patient-form";
import { getPatientEditForActiveTenant } from "@/lib/server/update-patient";

export const dynamic = "force-dynamic";

function PatientEditUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No es posible mostrar el formulario en este momento.</p>
      </section>
    </>
  );
}

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPatientEditForActiveTenant(id);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");

  if (result.state === "no_active_membership") {
    return <PatientEditUnavailable title="Sin clínica activa" description="Tu cuenta no tiene una membresía activa para editar pacientes." />;
  }

  if (result.state === "forbidden") {
    return <PatientEditUnavailable title="Acceso de solo lectura" description="Tu rol actual puede consultar pacientes, pero no editar sus datos." />;
  }

  if (result.state === "error") {
    return <PatientEditUnavailable title="No fue posible preparar el paciente" description="El formulario no está disponible temporalmente. Intenta nuevamente más tarde." />;
  }

  return (
    <>
      <Link href={`/dashboard/patients/${result.data.patient.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic">
        <ArrowLeft className="h-4 w-4" />
        Volver al paciente
      </Link>
      <PageHeader title="Editar paciente" description="Actualiza los datos permitidos dentro de la clínica activa." />
      <EditPatientForm
        patientId={result.data.patient.id}
        initialValues={result.data.initialValues}
        doctors={result.data.doctors}
        clinicToday={result.data.clinicToday}
      />
    </>
  );
}
