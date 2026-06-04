import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { signOutAction } from "@/app/(auth)/actions";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

async function getDashboardAccount() {
  if (!hasSupabaseConfig()) {
    return {
      name: "Demo mode",
      subtitle: "Supabase env not configured",
      isAuthenticated: false
    };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      name: "Demo mode",
      subtitle: "Not signed in",
      isAuthenticated: false
    };
  }

  const fullName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null;

  return {
    name: fullName ?? user.email ?? "Authenticated user",
    subtitle: user.email ?? "Supabase session active",
    isAuthenticated: true
  };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // TODO: Require auth here after clinic membership onboarding and first protected data reads are live.
  const account = await getDashboardAccount();

  return (
    <DashboardShell
      account={{ name: account.name, subtitle: account.subtitle }}
      footer={
        account.isAuthenticated ? (
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        ) : null
      }
    >
      {children}
    </DashboardShell>
  );
}
