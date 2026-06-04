"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileSignature,
  MessageSquareText,
  Plug,
  LayoutDashboard,
  Menu,
  Settings,
  Stethoscope,
  UsersRound,
  X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/patients", label: "Patients", icon: UsersRound },
  { href: "/dashboard/medical-notes", label: "Medical Notes", icon: ClipboardList },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/dashboard/consents", label: "Consents", icon: FileSignature },
  { href: "/dashboard/bot", label: "Bot", icon: MessageSquareText },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

export function DashboardShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <aside className="flex h-full w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">MedControl</p>
          <p className="text-xs text-slate-500">Clinic workspace</p>
        </div>
      </div>
      <nav className="grid gap-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-ink",
                active && "bg-teal-50 text-clinic"
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
          <p className="text-sm font-semibold text-ink">Dr. Morgan</p>
          <p className="text-xs text-slate-500">Primary care clinic</p>
        </div>
        {footer ? <div className="mt-3">{footer}</div> : null}
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">{sidebar}</div>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-ink">
          <Stethoscope className="h-5 w-5 text-clinic" />
          MedControl
        </Link>
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-700"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-[min(18rem,calc(100vw-2rem))] bg-white shadow-soft">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 pb-10 sm:px-6 lg:px-8 lg:py-6">{children}</div>
      </main>
    </div>
  );
}
