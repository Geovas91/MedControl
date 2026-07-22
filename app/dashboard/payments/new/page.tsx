import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { CreateClinicalPaymentForm } from "@/components/payments/create-clinical-payment-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getClinicalPaymentCreationOptions } from "@/lib/server/create-payment";

export const dynamic = "force-dynamic";

type NewClinicalPaymentPageProps = {
  searchParams: Promise<{ patient?: string | string[] }>;
};

function PaymentCreationUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No es posible mostrar el formulario en este momento.</p>
      </section>
    </>
  );
}

export default async function NewClinicalPaymentPage({ searchParams }: NewClinicalPaymentPageProps) {
  const params = await searchParams;
  const requestedPatientId = typeof params.patient === "string" ? params.patient : undefined;
  const result = await getClinicalPaymentCreationOptions(requestedPatientId);

  if (result.state === "unauthenticated") redirect("/login");

  if (result.state === "no_active_membership") {
    return <PaymentCreationUnavailable title="Sin clínica activa" description="Tu cuenta no tiene una membresía activa para registrar pagos." />;
  }

  if (result.state === "forbidden") {
    return <PaymentCreationUnavailable title="Acceso de solo lectura" description="Tu rol actual puede consultar esta sección, pero no registrar pagos clínicos." />;
  }

  if (result.state === "error") {
    return <PaymentCreationUnavailable title="No fue posible preparar el pago" description="El formulario no está disponible temporalmente. Intenta nuevamente más tarde." />;
  }

  return (
    <>
      <Link href="/dashboard/payments" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic">
        <ArrowLeft className="h-4 w-4" />
        Volver a pagos
      </Link>
      <PageHeader title="Registrar pago" description="Registra manualmente un cobro recibido de un paciente de la clínica activa." />
      <CreateClinicalPaymentForm {...result.data} />
    </>
  );
}
