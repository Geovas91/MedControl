import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();

  return <AdminShell adminEmail={user.email}>{children}</AdminShell>;
}
