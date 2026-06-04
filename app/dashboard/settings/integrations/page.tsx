import { CalendarDays, Copy, Download, Mail, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { calendarIntegrations, calendarSafeAppointments } from "@/lib/mock-calendar-integrations";
import { generateAppointmentIcs } from "@/lib/calendar/ics";

const providerIcon = {
  google: CalendarDays,
  icalendar: Download,
  whatsapp: MessageCircle,
  email: Mail
};

export default function IntegrationsPage() {
  const sampleIcs = generateAppointmentIcs(calendarSafeAppointments[0]);

  return (
    <>
      <PageHeader
        title="Calendar integrations"
        description="Mock setup for calendar sync, appointment invitations, and future reminder delivery."
      />

      <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Real OAuth, calendar sync, email, WhatsApp, and SMS delivery are not implemented yet. Do not add production
            credentials or real patient data. Calendar invitations should not include sensitive clinical information.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {calendarIntegrations.map((integration) => {
          const Icon = providerIcon[integration.provider];

          return (
            <article key={integration.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-ink">{integration.name}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{integration.description}</p>
                  </div>
                </div>
                <Badge variant={integration.status === "Connected" ? "green" : "slate"}>{integration.status}</Badge>
              </div>

              {integration.provider === "google" ? (
                <div className="mt-5 grid gap-3 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">Selected calendar:</span>{" "}
                    {integration.selectedCalendar}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Last sync:</span> {integration.lastSync}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Sync direction:</span>{" "}
                    {integration.syncDirection}
                  </p>
                  <p className="rounded-md bg-amber-50 p-3 text-amber-800">Google OAuth is not implemented yet.</p>
                  <Button type="button" variant="secondary">
                    <RefreshCw className="h-4 w-4" />
                    Connect Google Calendar
                  </Button>
                </div>
              ) : null}

              {integration.provider === "icalendar" ? (
                <div className="mt-5 grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="secondary">
                      <Download className="h-4 w-4" />
                      Generate .ics
                    </Button>
                    <Button type="button" variant="secondary">
                      <Download className="h-4 w-4" />
                      Download .ics
                    </Button>
                    <Button type="button" variant="secondary">
                      <Mail className="h-4 w-4" />
                      Attach to email
                    </Button>
                    <Button type="button" variant="secondary">
                      <Copy className="h-4 w-4" />
                      Copy feed URL
                    </Button>
                  </div>
                  <pre className="max-h-44 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {sampleIcs}
                  </pre>
                </div>
              ) : null}

              {integration.provider === "whatsapp" || integration.provider === "email" ? (
                <ul className="mt-5 grid gap-2 text-sm text-slate-600">
                  {integration.enabledFeatures.map((feature) => (
                    <li key={feature} className="rounded-md bg-slate-50 p-3">
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </section>
    </>
  );
}
