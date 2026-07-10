"use client";

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
  Star,
  UsersRound
} from "lucide-react";
import { getSalesWhatsAppUrl } from "@/config/contact";
import { brandConfig } from "@/config/brand";
import { getLocalizedCommercialPlans, getLocalizedCommonCommercialFeatures } from "@/config/plans";
import { ButtonLink } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { PublicHeader } from "@/components/public/public-header";
import { useLanguage } from "@/components/i18n/language-provider";

const featureIcons = [UsersRound, CalendarCheck, CreditCard, ShieldCheck] as const;

export default function LandingPage() {
  const { locale, messages } = useLanguage();
  const salesWhatsAppUrl = getSalesWhatsAppUrl();
  const commercialPlans = getLocalizedCommercialPlans(locale);
  const commonCommercialFeatures = getLocalizedCommonCommercialFeatures(locale);
  const pricingCopy = messages.landing.pricing;
  const comparison = [
    {
      feature: pricingCopy.rows.doctors,
      values: commercialPlans.map((plan) => plan.displayLimits.doctors)
    },
    {
      feature: pricingCopy.rows.clinic,
      values: commercialPlans.map((plan) => plan.displayLimits.clinic)
    },
    {
      feature: pricingCopy.rows.directory,
      values: commercialPlans.map((plan) => plan.displayLimits.directoryProfiles)
    },
    {
      feature: pricingCopy.rows.reviews,
      values: commercialPlans.map(() => pricingCopy.included)
    },
    {
      feature: pricingCopy.rows.paypal,
      values: commercialPlans.map(() => pricingCopy.prepared)
    }
  ];

  return (
    <main className="bg-white">
      <PublicHeader showSectionLinks icon="sparkles" />

      <section className="relative overflow-hidden border-b border-slate-200 bg-[#f4fbf8]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-clinic">
              {messages.landing.hero.eyebrow}
            </p>
            <h1 className="max-w-3xl break-words text-4xl font-bold tracking-normal text-ink sm:text-5xl lg:text-6xl">
              {messages.landing.hero.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{messages.landing.hero.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/dashboard" className="w-full sm:w-auto">
                {messages.landing.hero.primaryCta}
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="#pricing" variant="secondary" className="w-full sm:w-auto">
                {messages.landing.hero.secondaryCta}
              </ButtonLink>
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-soft sm:min-h-[360px]">
            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{messages.landing.demoCard.title}</p>
                  <p className="text-xs text-slate-500">{messages.landing.demoCard.date}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {messages.landing.demoCard.appointmentCount}
                </span>
              </div>
              {messages.landing.demoCard.patients.map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded-md border border-slate-200 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-sm font-bold text-clinic">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-ink">{item}</p>
                    <p className="text-sm text-slate-500">{messages.landing.demoCard.appointmentStatus}</p>
                  </div>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md bg-clinic p-4 text-white">
                  <p className="text-sm text-teal-50">{messages.landing.demoCard.collected}</p>
                  <p className="mt-2 text-2xl font-bold">{formatCurrency(390, "MXN", "es-MX")}</p>
                </div>
                <div className="rounded-md bg-amber-50 p-4 text-amber-800">
                  <p className="text-sm">{messages.landing.demoCard.pending}</p>
                  <p className="mt-2 text-2xl font-bold">{formatCurrency(360, "MXN", "es-MX")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-slate-200 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-ink">{messages.landing.features.title}</h2>
            <p className="mt-3 text-slate-600">{messages.landing.features.description}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {messages.landing.features.items.map((feature, index) => {
              const Icon = featureIcons[index] ?? UsersRound;
              return (
                <article key={feature.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">
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

      <section id="pricing" className="border-b border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-ink">{pricingCopy.title}</h2>
            <p className="mt-3 text-slate-600">{pricingCopy.description}</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {commercialPlans.map((plan) => (
              <article
                key={plan.id}
                className={`relative rounded-lg border p-6 shadow-sm ${
                  plan.highlighted ? "border-clinic bg-white ring-2 ring-teal-100" : "border-slate-200 bg-white"
                }`}
              >
                {plan.displayBadgeLabel ? (
                  <span className="absolute right-5 top-5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-clinic">
                    {plan.displayBadgeLabel}
                  </span>
                ) : null}
                <p className="text-sm font-semibold text-clinic">{plan.displayAudience}</p>
                <h3 className={`mt-3 text-lg font-bold text-ink ${plan.displayBadgeLabel ? "pr-24" : ""}`}>
                  {plan.displayName}
                </h3>
                <div className="mt-4 flex flex-wrap items-end gap-x-2 gap-y-1">
                  <p className="text-4xl font-bold text-ink">
                    {formatCurrency(plan.displayMonthlyPrice, plan.displayCurrency, locale === "es" ? "es-MX" : "en-US")}
                  </p>
                  <p className="pb-1 text-sm font-semibold text-slate-600">
                    {pricingCopy.monthlySuffix} {plan.displayTaxLabel}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.displayDescription}</p>
                <ButtonLink
                  href={plan.ctaHref}
                  className="mt-6 w-full"
                  variant={plan.highlighted ? "primary" : "secondary"}
                >
                  {plan.displayCtaLabel}
                </ButtonLink>
                <ul className="mt-6 grid gap-3">
                  {plan.displayFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-clinic" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="mt-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="text-xl font-bold text-ink">{pricingCopy.comparisonTitle}</h3>
                <p className="mt-1 text-sm text-slate-600">{pricingCopy.comparisonDescription}</p>
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
                    <th className="px-5 py-3 font-semibold">{pricingCopy.featureColumn}</th>
                    {commercialPlans.map((plan) => (
                      <th key={plan.id} className="px-5 py-3 font-semibold">
                        {plan.displayName.replace(`${brandConfig.appName} `, "")}
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

          <div className="mt-10 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-ink">{pricingCopy.includedInAll}</h3>
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
            <h2 className="text-3xl font-bold text-ink">{messages.landing.contact.title}</h2>
            <p className="mt-2 text-slate-600">{messages.landing.contact.description}</p>
          </div>
          {salesWhatsAppUrl ? (
            <a
              href={salesWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-clinic px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-800"
            >
              {messages.landing.contact.cta}
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-500"
            >
              {messages.landing.contact.pending}
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{messages.landing.footer.text}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span>{messages.landing.footer.demo}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
