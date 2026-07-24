"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, CreditCard, FileSignature, Globe2, LayoutDashboard, Menu, MessageSquareText, Plug, Settings, Stethoscope, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { AppVersionLabel } from "@/components/app-version-label";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/dashboard/patients", label: "Pacientes", icon: UsersRound },
  { href: "/dashboard/medical-notes", label: "Notas médicas", icon: ClipboardList },
  { href: "/dashboard/appointments", label: "Citas", icon: CalendarDays },
  { href: "/dashboard/consents", label: "Consentimientos", icon: FileSignature },
  { href: "/dashboard/bot", label: "Bot", icon: MessageSquareText },
  { href: "/dashboard/payments", label: "Pagos", icon: CreditCard },
  { href: "/dashboard/billing", label: "Facturación", icon: CreditCard },
  { href: "/dashboard/members", label: "Miembros", icon: UsersRound },
  { href: "/dashboard/directory", label: "Directorio", icon: Globe2 },
  { href: "/dashboard/settings/integrations", label: "Integraciones", icon: Plug },
  { href: "/dashboard/settings", label: "Configuración", icon: Settings }
];

const mobileNavItems = navItems.filter((item) => ["/dashboard", "/dashboard/appointments", "/dashboard/patients"].includes(item.href));

type DashboardShellProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  account?: { name: string; subtitle: string };
  subscriptionNotice?: string | null;
};

export function DashboardShell({ children, footer, account, subscriptionNotice }: DashboardShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <aside className="flex h-full w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-[var(--border)] bg-white/95 shadow-[var(--shadow-xs)]">
      <div className="flex h-[4.5rem] items-center gap-3 border-b border-[var(--border)] px-5">
        <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-clinic text-white shadow-xs"><Stethoscope className="h-5 w-5" /></div>
        <div><p className="text-sm font-bold text-ink">CliniControl</p><p className="text-xs text-[var(--foreground-muted)]">Espacio clínico</p></div>
      </div>
      <nav className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-3" aria-label="Navegación principal">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium text-[var(--foreground-soft)] transition duration-150 hover:bg-[var(--surface-muted)] hover:text-ink", active && "bg-[var(--clinic-soft)] text-clinic")}><Icon className="h-4 w-4" />{item.label}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-[var(--border)] p-4">
        <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3"><p className="truncate text-sm font-semibold text-ink">{account?.name ?? "Dr. Morgan"}</p><p className="truncate text-xs text-[var(--foreground-muted)]">{account?.subtitle ?? "Primary care clinic"}</p></div>
        {footer ? <div className="mt-3">{footer}</div> : null}
        <AppVersionLabel className="mt-3" />
      </div>
    </aside>
  );

  return <div className="min-h-screen bg-[var(--background)]">
    <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">{sidebar}</div>
    <header className="glass-nav sticky top-0 z-30 m-2 flex h-14 items-center justify-between px-4 lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2 font-bold text-ink"><Stethoscope className="h-5 w-5 text-clinic" />CliniControl</Link>
      <button type="button" aria-label="Abrir navegación" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/80 text-[var(--foreground-soft)]"><Menu className="h-5 w-5" /></button>
    </header>
    {open ? <div className="fixed inset-0 z-40 lg:hidden"><button type="button" aria-label="Cerrar navegación" className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} /><div className="relative h-full w-[min(18rem,calc(100vw-2rem))] bg-white shadow-dialog"><button type="button" aria-label="Cerrar navegación" onClick={() => setOpen(false)} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-white text-[var(--foreground-soft)]"><X className="h-4 w-4" /></button>{sidebar}</div></div> : null}
    <main className="lg:pl-72">
      <div className="hidden lg:sticky lg:top-0 lg:z-20 lg:block lg:px-6 lg:pt-3 xl:px-8"><div className="glass-nav flex h-14 items-center justify-between px-4 text-sm text-[var(--foreground-muted)]"><span>Espacio de trabajo clínico</span><span>Datos protegidos por clínica activa</span></div></div>
      <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 lg:px-8 lg:py-6 lg:pb-10">
        <section className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning)]"><p className="font-semibold">Ambiente de demostración</p><p>Algunos módulos muestran datos de ejemplo y todavía no deben usarse con pacientes reales.</p></section>
        {subscriptionNotice ? <section className="mb-5 rounded-[var(--radius-md)] border border-rose-200 bg-[var(--danger-soft)] p-4 text-sm leading-6 text-[var(--danger)]">{subscriptionNotice}</section> : null}
        {children}
        <footer className="mt-8 border-t border-[var(--border)] pt-4 lg:hidden"><AppVersionLabel /></footer>
      </div>
    </main>
    <nav className="glass-nav fixed inset-x-2 bottom-2 z-30 grid grid-cols-4 p-1 lg:hidden" aria-label="Navegación móvil principal">
      {mobileNavItems.map((item) => { const Icon = item.icon; const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("grid min-h-12 place-items-center gap-0.5 rounded-[var(--radius-sm)] px-2 text-[11px] font-semibold text-[var(--foreground-muted)]", active && "bg-[var(--clinic-soft)] text-clinic")}><Icon className="h-4 w-4" />{item.label}</Link>; })}
      <button type="button" aria-label="Abrir más opciones" aria-expanded={open} onClick={() => setOpen(true)} className="grid min-h-12 place-items-center gap-0.5 rounded-[var(--radius-sm)] px-2 text-[11px] font-semibold text-[var(--foreground-muted)]"><Menu className="h-4 w-4" />Más</button>
    </nav>
  </div>;
}
