import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Stethoscope } from "lucide-react";
import { completeOnboardingAction } from "@/app/onboarding/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select } from "@/components/ui/input";
import { getOnboardingStatus } from "@/lib/onboarding";

type OnboardingPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

function defaultClinicName(fullName: string | null) {
  return fullName ? `Consultorio de ${fullName}` : "Mi consultorio";
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const params = await searchParams;
  const status = await getOnboardingStatus();

  if (status.state === "unauthenticated") {
    redirect("/login");
  }

  if (status.state === "complete") {
    redirect("/dashboard");
  }

  const fullName = status.profile?.full_name ?? null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="font-bold text-ink">CliniControl</span>
        </Link>

        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <div className="grid h-12 w-12 place-items-center rounded-md bg-teal-50 text-clinic">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-3xl font-bold text-ink">Configura tu clínica</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Antes de entrar al dashboard, necesitamos asociar tu cuenta a una clínica o consultorio. Si trabajas de
              forma independiente, crearemos una clínica personal para organizar pacientes, citas, notas y pagos por
              clínica.
            </p>
            <div className="mt-5 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Se creará una membresía como propietario y una suscripción interna inicial del plan Básico. PayPal se
              conectará más adelante, sin cobros en este paso.
            </div>
          </div>

          <div>
            {params?.error ? (
              <p className="mb-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{params.error}</p>
            ) : null}

            <form action={completeOnboardingAction} className="grid gap-4">
              <Field label="Nombre de clínica o consultorio" htmlFor="clinic_name">
                <Input
                  id="clinic_name"
                  name="clinic_name"
                  autoComplete="organization"
                  defaultValue={defaultClinicName(fullName)}
                  placeholder="Mi consultorio"
                  required
                />
              </Field>

              <Field label="Tipo" htmlFor="clinic_type">
                <Select id="clinic_type" name="clinic_type" defaultValue="independent">
                  <option value="independent">Médico independiente</option>
                  <option value="small_clinic">Clínica pequeña</option>
                </Select>
              </Field>

              <Field label="Especialidad principal (opcional)" htmlFor="primary_specialty">
                <Input
                  id="primary_specialty"
                  name="primary_specialty"
                  placeholder="Medicina general, pediatría, nutrición..."
                />
              </Field>

              <AuthSubmitButton idleLabel="Continuar al dashboard" pendingLabel="Configurando clínica..." />
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
