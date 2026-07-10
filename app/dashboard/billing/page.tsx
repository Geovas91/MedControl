import { CreditCard, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaypalSubscriptionButton } from "@/components/dashboard/paypal-subscription-button";
import { commercialPlans } from "@/config/plans";
import { formatMXN } from "@/lib/format";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getPaypalEnvironment, getPaypalPlanIdForPlan, hasPaypalPublicConfig } from "@/lib/paypal/server";
import { getClinicPlanContext } from "@/lib/supabase/subscriptions";
import type { SubscriptionStatus } from "@/types/subscriptions";

const statusLabels: Record<SubscriptionStatus, string> = {
  inactive: "Inactiva",
  trialing: "En revisión",
  active: "Activa",
  past_due: "Pago pendiente",
  cancelled: "Cancelada"
};

const statusVariants: Record<SubscriptionStatus, "green" | "amber" | "slate"> = {
  inactive: "slate",
  trialing: "amber",
  active: "green",
  past_due: "amber",
  cancelled: "slate"
};

export default async function BillingPage() {
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  const planContextResult = await getClinicPlanContext(onboardingStatus.membership.clinic_id);
  const planContext = planContextResult.data;
  const currentStatus = planContext?.subscription?.status ?? "inactive";
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || null;
  const hasPublicPaypalConfig = hasPaypalPublicConfig();

  return (
    <>
      <PageHeader
        title="Facturación"
        description="Administra la suscripción mensual de tu clínica con PayPal sandbox."
      />

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Plan actual</p>
          <p className="mt-1 text-lg font-bold text-ink">{planContext?.plan.name ?? "Sin plan activo"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Estado de suscripción</p>
          <div className="mt-2">
            <Badge variant={statusVariants[currentStatus]}>{statusLabels[currentStatus]}</Badge>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Ambiente PayPal</p>
          <p className="mt-1 text-lg font-bold capitalize text-ink">{getPaypalEnvironment()}</p>
        </div>
      </section>

      {!hasPublicPaypalConfig ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Configura <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> para mostrar los botones de PayPal sandbox.
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-3">
        {commercialPlans.map((plan) => {
          const paypalPlanId = getPaypalPlanIdForPlan(plan);
          const isCurrentPlan = planContext?.planId === plan.id;
          const actionLabel = isCurrentPlan ? `Mantener ${plan.name}` : `Cambiar a ${plan.name}`;

          return (
            <article key={plan.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{plan.audience}</p>
                </div>
                {isCurrentPlan ? <Badge variant="teal">Plan actual</Badge> : null}
              </div>

              <p className="mt-5 text-3xl font-bold tracking-normal text-ink">
                {formatMXN(plan.monthlyPriceMxn)}
                <span className="text-sm font-semibold text-slate-500"> / mes {plan.taxLabel}</span>
              </p>

              <ul className="mt-5 grid gap-2 text-sm text-slate-600">
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-clinic" />
                  {plan.limits.doctors}
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-clinic" />
                  Suscripción mensual vía PayPal
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-clinic" />
                  Sin guardar tarjetas ni datos financieros sensibles
                </li>
              </ul>

              {!paypalPlanId ? (
                <p className="mt-5 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                  Falta configurar <code>{plan.billing.paypalPlanEnvKey}</code> para este plan.
                </p>
              ) : null}

              <div className="mt-auto pt-5">
                <PaypalSubscriptionButton
                  clientId={paypalClientId}
                  planId={plan.id}
                  paypalPlanId={paypalPlanId}
                  label={actionLabel}
                />
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
        <div className="flex gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-clinic" />
          <p>
            El botón registra la aprobación de PayPal y el webhook verificado será la fuente confiable para cambios
            posteriores de estado. CliniControl no almacena tarjetas ni credenciales financieras.
          </p>
        </div>
      </section>
    </>
  );
}
