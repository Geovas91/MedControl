import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { signOutAction } from "@/app/(auth)/actions";
import { getOnboardingStatus } from "@/lib/onboarding";
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

  return {
    name: fullName ?? onboardingStatus.user.email ?? "Usuario autenticado",
    subtitle: onboardingStatus.user.email ?? "Sesión activa en Supabase"
  };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const account = await getDashboardAccount();

  return (
    <DashboardShell
      account={{ name: account.name, subtitle: account.subtitle }}
      footer={
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </form>
      }
    >
      {children}
    </DashboardShell>
  );
}
