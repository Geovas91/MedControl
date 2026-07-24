import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { signOutAction } from "@/app/(auth)/actions";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getClinicEntitlements, getEntitlementNotice } from "@/lib/server/entitlements";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { ClinicSwitcher } from "@/components/dashboard/clinic-switcher";
import { redirect } from "next/navigation";

async function getDashboardAccount() {
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  const fullName = onboardingStatus.profile.full_name;

  const tenantContext = await getActiveTenantContext();
  const clinicId = tenantContext.state === "ready" ? tenantContext.tenant.clinic.id : onboardingStatus.membership.clinic_id;
  const entitlements = await getClinicEntitlements(clinicId);
  return {
    name: fullName ?? onboardingStatus.user.email ?? "Usuario autenticado",
    subtitle: onboardingStatus.user.email ?? "Sesión activa en Supabase",
    subscriptionNotice: getEntitlementNotice(entitlements),
    tenant: tenantContext.state === "ready" ? tenantContext.tenant : null
  };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const account = await getDashboardAccount();

  return (
    <DashboardShell
      account={{ name: account.name, subtitle: account.subtitle }}
      subscriptionNotice={account.subscriptionNotice}
      footer={
        <>
          {account.tenant ? <ClinicSwitcher activeClinicId={account.tenant.clinic.id} clinics={account.tenant.availableClinics} /> : null}
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground-soft)] shadow-xs transition hover:bg-[var(--surface-muted)]"
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
