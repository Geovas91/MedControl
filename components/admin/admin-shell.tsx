"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, LayoutDashboard, Stethoscope, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/clinics", label: "Clínicas", icon: Building2 },
  { href: "/admin/doctors", label: "Médicos", icon: UsersRound },
  { href: "/admin/subscriptions", label: "Suscripciones", icon: CreditCard }
];

export function AdminShell({ children, adminEmail }: { children: React.ReactNode; adminEmail?: string | null }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Administración CliniControl</p>
              <p className="text-xs text-slate-500">Portal interno</p>
            </div>
          </div>
        </div>
        <nav className="grid gap-1 p-3">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-ink",
                  active && "bg-slate-900 text-white hover:bg-slate-900 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-slate-200 p-4">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Administrador</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink">{adminEmail ?? "Cuenta interna"}</p>
          </div>
          <Link
            href="/dashboard"
            className="mt-3 flex h-10 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            Volver al dashboard
          </Link>
        </div>
      </aside>

      <header className="border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-ink">Administración CliniControl</p>
            <p className="text-xs text-slate-500">Portal interno</p>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold text-clinic">
            Dashboard
          </Link>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {adminNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200",
                pathname === item.href && "bg-slate-900 text-white ring-slate-900"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
