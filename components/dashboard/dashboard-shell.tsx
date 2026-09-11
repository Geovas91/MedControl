"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, CreditCard, FileSignature, Globe2, LayoutDashboard, LifeBuoy, Menu, MessageSquareText, Plug, Settings, ShieldCheck, Stethoscope, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppVersionLabel } from "@/components/app-version-label";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { isDashboardNavItemActive } from "@/lib/dashboard/navigation";
import { cn } from "@/lib/utils";

const DRAWER_ID = "dashboard-mobile-navigation";
const navItems = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/dashboard/patients", label: "Pacientes", icon: UsersRound },
  { href: "/dashboard/medical-notes", label: "Notas médicas", icon: ClipboardList },
  { href: "/dashboard/appointments", label: "Citas", icon: CalendarDays },
  { href: "/dashboard/consents", label: "Consentimientos", icon: FileSignature },
  { href: "/dashboard/bot", label: "Asistente de agenda", icon: MessageSquareText },
  { href: "/dashboard/support", label: "Ayuda y soporte", icon: LifeBuoy },
  { href: "/dashboard/payments", label: "Pagos", icon: CreditCard },
  { href: "/dashboard/billing", label: "Facturación", icon: CreditCard },
  { href: "/dashboard/members", label: "Miembros", icon: UsersRound },
  { href: "/dashboard/directory", label: "Directorio", icon: Globe2 },
  { href: "/dashboard/settings/integrations", label: "Integraciones", icon: Plug },
  { href: "/dashboard/settings", label: "Configuración", icon: Settings }
];
const mobileNavItems = navItems.filter((item) => ["/dashboard", "/dashboard/appointments", "/dashboard/patients"].includes(item.href));
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DashboardShellProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  account?: { name: string; subtitle: string };
  subscriptionNotice?: string | null;
  appointmentAssistantAvailable?: boolean;
};

export function DashboardShell({ children, footer, account, subscriptionNotice, appointmentAssistantAvailable = false }: DashboardShellProps) {
  const pathname = usePathname();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const open = drawerPath === pathname;
  const visibleNavItems = appointmentAssistantAvailable ? navItems : navItems.filter((item) => item.href !== "/dashboard/bot");
  const closeDrawer = () => setDrawerPath(null);
  const openDrawer = (event: React.MouseEvent<HTMLButtonElement>) => {
    openerRef.current = event.currentTarget;
    setDrawerPath(pathname);
  };

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appContent = appContentRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (appContent) {
      appContent.setAttribute("aria-hidden", "true");
      appContent.inert = true;
    }

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (appContent) {
        appContent.removeAttribute("aria-hidden");
        appContent.inert = false;
      }
      (openerRef.current ?? previousFocusRef.current)?.focus();
    };
  }, [open]);

  const sidebar = (inDrawer = false) => (
    <aside className="app-sidebar glass-surface flex h-full w-[min(17rem,calc(100vw-2rem))] flex-col overflow-hidden">
      <div className="glass-divider flex h-[4.75rem] items-center gap-3 border-b px-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/30 bg-[linear-gradient(145deg,#0c8b85,#086b68)] text-white shadow-[0_12px_25px_rgba(8,124,120,0.25),inset_0_1px_0_rgba(255,255,255,0.28)]"><Stethoscope className="h-5 w-5" /></div>
        <div><p className="text-[15px] font-bold tracking-[-0.01em] text-ink">CliniControl</p><p className="text-xs text-[var(--foreground-muted)]">Espacio clínico</p></div>
      </div>
      <nav className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-3.5" aria-label={inDrawer ? "Navegación principal" : undefined}>
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = isDashboardNavItemActive(pathname, item.href);
          return <Link key={item.href} href={item.href} onClick={closeDrawer} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-[var(--foreground-soft)] transition duration-150 hover:border-white/80 hover:bg-white/60 hover:text-ink", active && "border-white/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(219,245,242,0.82))] font-semibold text-teal-800 shadow-[0_8px_20px_rgba(27,101,99,0.11),inset_0_1px_0_#fff]")}><span className={cn("grid h-7 w-7 place-items-center rounded-lg", active ? "bg-white/80 text-clinic shadow-xs" : "text-[var(--foreground-muted)]")}><Icon className="h-4 w-4" /></span>{item.label}</Link>;
        })}
      </nav>
      <div className="glass-divider mt-auto border-t p-4">
        <div className="glass-card rounded-2xl p-3.5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--clinic-soft)] text-clinic"><UserRound className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{account?.name ?? "Dr. Morgan"}</p><p className="truncate text-xs text-[var(--foreground-muted)]">{account?.subtitle ?? "Primary care clinic"}</p></div></div></div>
        {footer ? <div className="mt-3">{footer}</div> : null}
        <InstallAppButton className="mt-3" />
        <AppVersionLabel className="app-version-footer mt-3" />
      </div>
    </aside>
  );

  return <div className="app-aeroglass min-h-screen bg-[var(--background)]">
    <div ref={appContentRef}>
      <div className="app-navigation hidden lg:fixed lg:inset-y-3 lg:left-3 lg:z-30 lg:block">{sidebar()}</div>
      <header className="app-topbar app-navigation glass-nav sticky top-2 z-30 mx-2 mt-2 flex h-14 items-center justify-between px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-ink"><Stethoscope className="h-5 w-5 text-clinic" />CliniControl</Link>
        <button type="button" aria-label="Abrir navegación" aria-expanded={open} aria-controls={DRAWER_ID} onClick={openDrawer} className="glass-control grid h-11 w-11 place-items-center text-[var(--foreground-soft)]"><Menu className="h-5 w-5" /></button>
      </header>
      <main className="app-main-content lg:pl-[18.5rem]">
        <div className="app-topbar app-navigation hidden lg:sticky lg:top-0 lg:z-20 lg:block lg:px-5 lg:pt-3 xl:px-7"><div className="glass-nav flex min-h-14 items-center justify-between gap-4 px-4 py-2 text-sm text-[var(--foreground-muted)]"><span className="glass-control inline-flex min-h-9 items-center px-4 font-medium text-[var(--foreground-soft)]">Espacio de trabajo clínico</span><div className="flex min-w-0 items-center gap-2"><span className="hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-teal-800 xl:inline-flex"><ShieldCheck className="h-4 w-4" />Datos protegidos por clínica activa</span><span className="glass-control inline-flex min-w-0 items-center gap-2 px-3 py-2"><UserRound className="h-4 w-4 shrink-0 text-clinic" /><span className="max-w-44 truncate text-xs font-semibold text-ink">{account?.name ?? "Usuario"}</span></span></div></div></div>
        <div className="mx-auto w-full max-w-[90rem] px-4 py-4 sm:px-6 lg:px-7 lg:py-6 lg:pb-10">
          <section className="mb-5 rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 text-sm leading-6 text-amber-900 shadow-[0_8px_24px_rgba(180,83,9,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]"><p className="font-semibold">Ambiente de demostración</p><p>Algunos módulos muestran datos de ejemplo y todavía no deben usarse con pacientes reales.</p></section>
          {subscriptionNotice ? <section className="mb-5 rounded-2xl border border-rose-300 bg-rose-50/95 p-4 text-sm leading-6 text-rose-900 shadow-[0_8px_24px_rgba(190,18,60,0.08)]">{subscriptionNotice}</section> : null}
          {children}
          <footer className="app-version-footer mt-8 border-t border-[var(--border)] pt-4 lg:hidden"><AppVersionLabel /></footer>
        </div>
      </main>
      <nav className="app-mobile-navigation app-navigation glass-nav fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 p-1.5 lg:hidden" aria-label="Navegación móvil principal">
        {mobileNavItems.map((item) => { const Icon = item.icon; const active = isDashboardNavItemActive(pathname, item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("grid min-h-12 place-items-center gap-0.5 rounded-xl border border-transparent px-2 text-[11px] font-semibold text-[var(--foreground-muted)] transition", active && "border-white bg-[var(--clinic-soft)] text-teal-800 shadow-xs")}><Icon className="h-4 w-4" />{item.label}</Link>; })}
        <button type="button" aria-label="Abrir más opciones" aria-expanded={open} aria-controls={DRAWER_ID} onClick={openDrawer} className="grid min-h-12 place-items-center gap-0.5 rounded-xl px-2 text-[11px] font-semibold text-[var(--foreground-muted)]"><Menu className="h-4 w-4" />Más</button>
      </nav>
    </div>
    {open ? <div className="app-mobile-navigation fixed inset-0 z-40 p-2 lg:hidden"><button type="button" aria-label="Cerrar navegación" className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={closeDrawer} tabIndex={-1} /><div ref={dialogRef} id={DRAWER_ID} role="dialog" aria-modal="true" aria-label="Navegación principal" className="app-mobile-drawer relative h-full w-[min(17rem,calc(100vw-2rem))] rounded-[var(--radius-xl)] shadow-dialog"><button ref={closeButtonRef} type="button" aria-label="Cerrar navegación" onClick={closeDrawer} className="glass-control non-printable-action absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center text-[var(--foreground-soft)]"><X className="h-4 w-4" /></button>{sidebar(true)}</div></div> : null}
  </div>;
}
