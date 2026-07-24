import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  FileSignature,
  MessageCircle,
  Plug,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { getSalesWhatsAppUrl } from "@/config/contact";
import { commercialPlans, commonCommercialFeatures } from "@/config/plans";
import { AppVersionLabel } from "@/components/app-version-label";
import { ButtonLink } from "@/components/ui/button";
import { formatMXN } from "@/lib/format";

const features = [
  {
    title: "Expedientes de pacientes",
    description: "Centraliza datos de contacto, estatus de atención, notas médicas y próximas citas en perfiles claros.",
    icon: UsersRound
  },
  {
    title: "Agenda diaria",
    description: "Consulta el día por horario, médico asignado, tipo de cita y estado de confirmación.",
    icon: CalendarCheck
  },
  {
    title: "Pagos y saldos",
    description: "Registra ingresos cobrados, pagos pendientes e historial sin convertir la app en un sistema contable pesado.",
    icon: CreditCard
  },
  {
    title: "Base segura para clínicas",
    description: "Estructura preparada para cuentas autenticadas, permisos por clínica y seguridad de datos en Supabase.",
    icon: ShieldCheck
  }
];

const comparison = [
  {
    feature: "Médicos incluidos",
    values: commercialPlans.map((plan) => plan.limits.doctors)
  },
  {
    feature: "Tipo de clínica",
    values: commercialPlans.map((plan) => plan.limits.clinic)
  },
  {
    feature: "Directorio médico público",
    values: commercialPlans.map((plan) => plan.limits.directoryProfiles)
  },
  {
    feature: "Reseñas verificadas por estrellas",
    values: commercialPlans.map(() => "Incluidas")
  },
  {
    feature: "Suscripción mensual vía PayPal",
    values: commercialPlans.map(() => "Preparada")
  }
];

export default function LandingPage() {
  const salesWhatsAppUrl = getSalesWhatsAppUrl();

  return (
    <main className="bg-white">
      <header className="glass-nav sticky top-0 z-30 mx-2 mt-2">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-clinic text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="truncate text-lg font-bold text-ink">CliniControl</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-clinic">
              Funciones
            </a>
            <a href="#pricing" className="hover:text-clinic">
              Planes
            </a>
            <Link href="/directorio" className="hover:text-clinic">
              Directorio médico
            </Link>
            <a href="#contact" className="hover:text-clinic">
              Contacto
            </a>
          </nav>
          <ButtonLink href="/login" variant="secondary" className="h-10 min-h-10 shrink-0 px-3 text-xs sm:px-4 sm:text-sm">
            Iniciar sesión
          </ButtonLink>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--background-soft)]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="responsive-grid-child flex flex-col justify-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-clinic">
              Gestión médica para clínicas en México
            </p>
            <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-ink sm:text-5xl lg:text-6xl">
              El control total de tu clínica, en una sola plataforma
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Un SaaS claro para médicos y clínicas pequeñas que necesitan organizar pacientes, agenda, notas médicas,
              consentimientos y pagos sin fricción administrativa.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/dashboard">
                Ver dashboard
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="#pricing" variant="secondary">
                Ver planes
              </ButtonLink>
            </div>
          </div>

          <div className="responsive-grid-child glass-panel min-h-[360px] p-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-white/85 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Flujo de consulta de hoy</p>
                  <p className="text-xs text-slate-500">Lunes, 25 de mayo</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  4 citas
                </span>
              </div>
              {["09:00 Alicia Ramírez", "10:30 Nora Benítez", "12:00 Marco Silva"].map((item, index) => (
                <div key={item} className="clinical-surface flex items-center gap-4 p-4">
                  <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--clinic-soft)] text-sm font-bold text-clinic">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-ink">{item}</p>
                    <p className="text-sm text-slate-500">Cita confirmada</p>
                  </div>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[var(--radius-md)] bg-clinic p-4 text-white">
                  <p className="text-sm text-teal-50">Cobrado</p>
                  <p className="mt-2 text-2xl font-bold">{formatMXN(390)}</p>
                </div>
                <div className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] p-4 text-[var(--warning)]">
                  <p className="text-sm">Pendiente</p>
                  <p className="mt-2 text-2xl font-bold">{formatMXN(360)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-[var(--border)] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-ink">Diseñado para el trabajo diario de consulta</h2>
            <p className="mt-3 text-slate-600">
              CliniControl empieza con lo esencial para atender pacientes, coordinar equipos y cerrar el día con claridad.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="surface-card p-5">
                  <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-[var(--clinic-soft)] text-clinic">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-bold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-[var(--border)] bg-[var(--background-soft)] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-ink">Planes para médicos y clínicas pequeñas</h2>
            <p className="mt-3 text-slate-600">
              Precios mensuales en pesos mexicanos. La suscripción mensual vía PayPal se gestiona desde el dashboard de
              la clínica.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {commercialPlans.map((plan) => (
              <article
                key={plan.id}
                className={`relative rounded-[var(--radius-lg)] border p-6 shadow-sm ${
                  plan.highlighted ? "border-clinic bg-white ring-2 ring-teal-100" : "border-[var(--border)] bg-white"
                }`}
              >
                {plan.badgeLabel ? (
                  <span className="absolute right-5 top-5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-clinic">
                    {plan.badgeLabel}
                  </span>
                ) : null}
                <p className="text-sm font-semibold text-clinic">{plan.audience}</p>
                <h3 className={`mt-3 text-lg font-bold text-ink ${plan.badgeLabel ? "pr-24" : ""}`}>{plan.name}</h3>
                <div className="mt-4 flex flex-wrap items-end gap-x-2 gap-y-1">
                  <p className="text-4xl font-bold text-ink">{formatMXN(plan.monthlyPriceMxn)}</p>
                  <p className="pb-1 text-sm font-semibold text-slate-600">/ mes {plan.taxLabel}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
                <ButtonLink href={plan.ctaHref} className="mt-6 w-full" variant={plan.highlighted ? "primary" : "secondary"}>
                  {plan.ctaLabel}
                </ButtonLink>
                <ul className="mt-6 grid gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-clinic" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="surface-card mt-10 overflow-hidden">
            <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="text-xl font-bold text-ink">Comparación comercial</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Todos los planes operan con clínica personal o clínica registrada para mantener pacientes, equipos y
                  permisos organizados por clínica.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-clinic">
                <Plug className="h-5 w-5" />
                <FileSignature className="h-5 w-5" />
                <MessageCircle className="h-5 w-5" />
                <Bot className="h-5 w-5" />
                <Star className="h-5 w-5" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Función</th>
                    {commercialPlans.map((plan) => (
                      <th key={plan.id} className="px-5 py-3 font-semibold">
                        {plan.name.replace("CliniControl ", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {comparison.map((item) => (
                    <tr key={item.feature}>
                      <td className="px-5 py-3 font-medium text-ink">{item.feature}</td>
                      {item.values.map((value, index) => (
                        <td key={`${item.feature}-${commercialPlans[index]?.id}`} className="px-5 py-3 text-slate-600">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="surface-card mt-10 p-6">
            <h3 className="text-xl font-bold text-ink">Incluido en todos los planes</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {commonCommercialFeatures.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-clinic" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="bg-white py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-3xl font-bold text-ink">¿Listo para organizar tu consulta?</h2>
            <p className="mt-2 text-slate-600">
              Escríbenos por WhatsApp para revisar qué plan encaja mejor con tu operación médica.
            </p>
          </div>
          {salesWhatsAppUrl ? (
            <a
              href={salesWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-clinic px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-800"
            >
              Contactar a ventas
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-500"
            >
              WhatsApp de ventas por configurar
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </section>
      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">CliniControl para médicos y clínicas pequeñas.</p>
          <AppVersionLabel />
        </div>
      </footer>
    </main>
  );
}
