import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // TODO: Add Supabase Auth guards here after profiles and clinic_members onboarding are live.
  return <DashboardShell>{children}</DashboardShell>;
}
