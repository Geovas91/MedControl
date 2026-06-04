import { Bell, Building2, Plug, ShieldCheck, UserRoundCog } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";

const settings = [
  {
    title: "Clinic profile",
    description: "Practice name, address, phone, and basic front desk details.",
    icon: Building2
  },
  {
    title: "Team access",
    description: "Doctor and staff roles will be configured when authentication is connected.",
    icon: UserRoundCog
  },
  {
    title: "Notifications",
    description: "Appointment reminders and billing alerts can live here later.",
    icon: Bell
  },
  {
    title: "Privacy controls",
    description: "Future audit logs, data export, and security settings for clinic workflows.",
    icon: ShieldCheck
  },
  {
    title: "Integrations",
    description: "Calendar sync, ICS invitations, and messaging provider scaffolding.",
    icon: Plug,
    href: "/dashboard/settings/integrations"
  }
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Placeholder configuration area for the clinic workspace. No external services are connected yet."
      />

      <section className="grid gap-4 md:grid-cols-2">
        {settings.map((item) => {
          const Icon = item.icon;

          return (
            <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              {item.href ? (
                <ButtonLink href={item.href} variant="secondary" className="mt-5">
                  Open integrations
                </ButtonLink>
              ) : null}
            </article>
          );
        })}
      </section>
    </>
  );
}
