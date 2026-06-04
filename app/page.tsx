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
  UsersRound
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

const features = [
  {
    title: "Patient records",
    description: "Centralize contact data, clinical notes, next visits, and care status in one readable profile.",
    icon: UsersRound
  },
  {
    title: "Daily agenda",
    description: "See today clearly with appointment status, visit type, assigned doctor, and next patient context.",
    icon: CalendarCheck
  },
  {
    title: "Payment tracking",
    description: "Track collected income and pending balances without forcing a full accounting system on day one.",
    icon: CreditCard
  },
  {
    title: "Privacy-first structure",
    description: "A clean app foundation designed for authenticated clinic workflows and future database security.",
    icon: ShieldCheck
  }
];

const pricing = [
  {
    name: "Solo Doctor",
    price: "$29",
    detail: "For individual practitioners starting to digitize their workflow.",
    perks: ["Patient list", "Daily agenda", "Payment summaries"]
  },
  {
    name: "Small Clinic",
    price: "$79",
    detail: "For teams that need shared visibility across front desk and providers.",
    perks: ["Multiple doctors", "Clinic dashboard", "Calendar integrations", "Digital consent signing"],
    highlighted: true
  },
  {
    name: "Premium Clinic",
    price: "Custom",
    detail: "For expanding clinics that need reminders, consent workflows, and multi-doctor operations.",
    perks: [
      "Appointment confirmation bot",
      "WhatsApp/SMS reminders",
      "Calendar integrations",
      "Digital consent signing",
      "Multi-doctor clinic workflows"
    ]
  }
];

const comparison = [
  { feature: "Patient, appointment, and payment workspace", solo: true, clinic: true, premium: true },
  { feature: "Calendar integrations", solo: false, clinic: true, premium: true },
  { feature: "Digital consent signing", solo: false, clinic: true, premium: true },
  { feature: "WhatsApp/SMS reminders", solo: false, clinic: false, premium: true },
  { feature: "Appointment confirmation bot", solo: false, clinic: false, premium: true }
];

export default function LandingPage() {
  return (
    <main className="bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-ink">MedControl</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-clinic">
              Features
            </a>
            <a href="#pricing" className="hover:text-clinic">
              Pricing
            </a>
            <a href="#contact" className="hover:text-clinic">
              Contact
            </a>
          </nav>
          <ButtonLink href="/login" variant="secondary" className="h-10">
            Sign in
          </ButtonLink>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-[#f4fbf8]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-clinic">
              Clinic operations, simplified
            </p>
            <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-ink sm:text-5xl lg:text-6xl">
              MedControl
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              A focused SaaS workspace for doctors and small clinics to manage patients, appointments, and payments
              with less administrative drag.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/dashboard">
                View dashboard
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="#pricing" variant="secondary">
                See pricing
              </ButtonLink>
            </div>
          </div>

          <div className="min-h-[360px] rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="grid gap-4">
              <div className="flex items-center justify-between rounded-md bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Today&apos;s clinic flow</p>
                  <p className="text-xs text-slate-500">Monday, May 25</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  4 visits
                </span>
              </div>
              {["09:00 Alicia Ramirez", "10:30 Nora Bennett", "12:00 Marco Silva"].map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded-md border border-slate-200 p-4">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-sm font-bold text-clinic">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-ink">{item}</p>
                    <p className="text-sm text-slate-500">Confirmed appointment</p>
                  </div>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md bg-clinic p-4 text-white">
                  <p className="text-sm text-teal-50">Collected</p>
                  <p className="mt-2 text-2xl font-bold">$390</p>
                </div>
                <div className="rounded-md bg-amber-50 p-4 text-amber-800">
                  <p className="text-sm">Pending</p>
                  <p className="mt-2 text-2xl font-bold">$360</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-slate-200 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-ink">Built around everyday clinic work</h2>
            <p className="mt-3 text-slate-600">
              MedControl starts with the essentials your team needs every morning, every visit, and every close of day.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
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
            <h2 className="text-3xl font-bold text-ink">Pricing for lean practices</h2>
            <p className="mt-3 text-slate-600">Start small and grow into the workflows your clinic actually uses.</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pricing.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-lg border p-6 shadow-sm ${
                  plan.highlighted ? "border-clinic bg-white ring-2 ring-teal-100" : "border-slate-200 bg-white"
                }`}
              >
                <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
                <p className="mt-4 text-4xl font-bold text-ink">{plan.price}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.detail}</p>
                <ul className="mt-6 grid gap-3">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-clinic" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="mt-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="text-xl font-bold text-ink">Feature comparison</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Advanced integrations remain mock-only until authentication, permissions, and secure data storage are
                  connected.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-clinic">
                <Plug className="h-5 w-5" />
                <FileSignature className="h-5 w-5" />
                <MessageCircle className="h-5 w-5" />
                <Bot className="h-5 w-5" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Feature</th>
                    <th className="px-5 py-3 font-semibold">Solo</th>
                    <th className="px-5 py-3 font-semibold">Clinic</th>
                    <th className="px-5 py-3 font-semibold">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {comparison.map((item) => (
                    <tr key={item.feature}>
                      <td className="px-5 py-3 font-medium text-ink">{item.feature}</td>
                      {[item.solo, item.clinic, item.premium].map((included, index) => (
                        <td key={index} className="px-5 py-3 text-slate-600">
                          {included ? <CheckCircle2 className="h-4 w-4 text-clinic" /> : "Add-on"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="bg-white py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-3xl font-bold text-ink">Ready to organize your clinic?</h2>
            <p className="mt-2 text-slate-600">Book a setup conversation and map your first patient workflow.</p>
          </div>
          <ButtonLink href="mailto:hello@medcontrol.app">
            Contact sales
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
