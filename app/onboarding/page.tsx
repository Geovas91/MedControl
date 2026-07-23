import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Stethoscope } from "lucide-react";
import { completeOnboardingAction } from "@/app/onboarding/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select } from "@/components/ui/input";
import { commercialPlans } from "@/config/plans";
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
              Completa los datos operativos, confirma la responsabilidad del owner y selecciona el plan que revisarás
              antes de pagar.
            </p>
            <div className="mt-5 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Se creará una membresía owner activa y una suscripción pendiente. Este paso no crea pagos clínicos ni
              cobra con PayPal.
            </div>
          </div>

          <div>
            {params?.error ? (
              <p className="mb-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{params.error}</p>
            ) : null}

            <form action={completeOnboardingAction} className="grid gap-4">
              <p className="text-sm font-bold text-ink">Paso 1: Datos de la clínica</p>
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
              <Field label="Nombre legal (opcional)" htmlFor="legal_name"><Input id="legal_name" name="legal_name" autoComplete="organization" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Teléfono" htmlFor="phone"><Input id="phone" name="phone" autoComplete="tel" /></Field>
                <Field label="Correo administrativo de la clínica" htmlFor="clinic_email"><Input id="clinic_email" name="clinic_email" type="email" autoComplete="email" /></Field>
                <Field label="Zona horaria" htmlFor="timezone"><Select id="timezone" name="timezone" defaultValue="America/Mexico_City"><option value="America/Mexico_City">Ciudad de México</option><option value="America/Tijuana">Tijuana</option><option value="America/Cancun">Cancún</option></Select></Field>
                <Field label="País" htmlFor="country"><Input id="country" name="country" defaultValue="México" autoComplete="country-name" /></Field>
                <Field label="Estado o región" htmlFor="region"><Input id="region" name="region" autoComplete="address-level1" /></Field>
              </div>
              <Field label="Dirección (opcional)" htmlFor="address"><Input id="address" name="address" autoComplete="street-address" /></Field>
              <p className="pt-2 text-sm font-bold text-ink">Paso 2: Responsable</p>
              <Field label="Nombre completo del owner" htmlFor="owner_full_name"><Input id="owner_full_name" name="owner_full_name" autoComplete="name" defaultValue={fullName ?? ""} required /></Field>
              <div className="grid gap-3 text-sm text-slate-600">
                <label className="flex gap-2"><input name="accepted_terms" type="checkbox" required />Acepto los términos aplicables.</label>
                <label className="flex gap-2"><input name="accepted_privacy" type="checkbox" required />Acepto el aviso de privacidad aplicable.</label>
                <label className="flex gap-2"><input name="accepted_clinical_responsibility" type="checkbox" required />Confirmo mi responsabilidad sobre la configuración y el uso clínico.</label>
              </div>
              <p className="pt-2 text-sm font-bold text-ink">Paso 3: Plan</p>
              <Field label="Plan a configurar" htmlFor="plan_id"><Select id="plan_id" name="plan_id" defaultValue="basic">{commercialPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - pendiente de pago</option>)}</Select></Field>

              <AuthSubmitButton idleLabel="Continuar al dashboard" pendingLabel="Configurando clínica..." />
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
