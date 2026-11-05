import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { signOutAction } from "@/app/(auth)/actions";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getClinicEntitlements, getEntitlementNotice, planIncludesFeature } from "@/lib/server/entitlements";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateClinicalPayments } from "@/lib/payments/create";
import { redirect } from "next/navigation";
import Link from "next/link";

async function getDashboardAccount() {
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state === "error") throw new Error("Clinic access is temporarily unavailable.");

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  const fullName = onboardingStatus.profile.full_name;

  const tenantContext = await getActiveTenantContext();
  if (tenantContext.state !== "ready") throw new Error("Clinic access is temporarily unavailable.");
  const clinicId = tenantContext.tenant.clinic.id;
  const entitlements = await getClinicEntitlements(clinicId);
  const trialEnd = entitlements.state === "ready" && entitlements.entitlements.persistedStatus === "trialing"
    ? entitlements.entitlements.subscription.current_period_end
    : null;
  const trialDeadline = trialEnd && Number.isFinite(Date.parse(trialEnd))
    ? new Intl.DateTimeFormat("es-MX", {
      dateStyle: "long", timeStyle: "short", timeZone: tenantContext.tenant.clinic.timezone
    }).format(new Date(trialEnd))
    : null;
  return {
    name: fullName ?? onboardingStatus.user.email ?? "Usuario autenticado",
    subtitle: onboardingStatus.user.email ?? "Sesión activa en Supabase",
    subscriptionNotice: getEntitlementNotice(entitlements),
    trialDeadline,
    trialExpired: entitlements.state === "ready" && entitlements.entitlements.effectiveStatus === "trial_expired",
    appointmentAssistantAvailable: planIncludesFeature(entitlements, "appointment_assistant"),
    tenant: tenantContext.tenant
  };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const account = await getDashboardAccount();

  return (
    <DashboardShell
      account={{ name: account.name, subtitle: account.subtitle }}
      subscriptionNotice={account.subscriptionNotice || account.trialDeadline ? (
        <>
          {account.subscriptionNotice}
          {account.trialDeadline ? <p>Fin de la prueba: {account.trialDeadline} ({account.tenant.clinic.timezone}).</p> : null}
          {account.trialExpired && account.tenant.membership.role === "owner" ? (
            <Link className="underline" href="/dashboard/billing">Revisar planes y contratación</Link>
          ) : null}
        </>
      ) : null}
      appointmentAssistantAvailable={account.appointmentAssistantAvailable}
      clinicalPaymentsAvailable={canCreateClinicalPayments(account.tenant.membership.role)}
      footer={
        <>
          <p className="mb-3 px-3 text-sm font-semibold text-[var(--foreground-soft)]">{account.tenant.clinic.name}</p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="glass-control min-h-11 w-full px-3 py-2 text-sm font-semibold text-[var(--foreground-soft)]"
            >
              Cerrar sesión
            </button>
          </form>
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
