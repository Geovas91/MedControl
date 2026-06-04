import { CalendarPlus, Clock, Mail, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { appointments } from "@/lib/mock-data";
import { getInvitationForAppointment } from "@/lib/mock-calendar-integrations";

export default function AppointmentsPage() {
  return (
    <>
      <PageHeader
        title="Daily agenda"
        description="Coordinate today’s appointments, visit types, and status checks."
        action={{ label: "New appointment", href: "/dashboard/appointments/new", icon: <CalendarPlus className="h-4 w-4" /> }}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4">
          {appointments.map((appointment) => (
            <article key={appointment.id} className="grid gap-4 rounded-md border border-slate-200 p-4 lg:grid-cols-[120px_1fr_auto] lg:items-center">
              <div className="flex items-center gap-2 font-bold text-ink">
                <Clock className="h-4 w-4 text-clinic" />
                {appointment.time}
              </div>
              <div>
                <h2 className="font-bold text-ink">{appointment.patientName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {appointment.type} · {appointment.doctor}
                </p>
                <AppointmentInvitePreview appointmentId={appointment.id} />
              </div>
              <Badge variant={appointment.status === "Completed" ? "green" : appointment.status === "Waiting" ? "amber" : "teal"}>
                {appointment.status}
              </Badge>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        Calendar invitations should not include sensitive clinical information.
      </section>
    </>
  );
}

function AppointmentInvitePreview({ appointmentId }: { appointmentId: string }) {
  const invite = getInvitationForAppointment(appointmentId);

  if (!invite) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2">
      <p>
        <span className="font-semibold text-slate-700">Location:</span> {invite.location}
      </p>
      <p>
        <span className="font-semibold text-slate-700">Invite:</span> {invite.calendarInviteStatus}
      </p>
      <p>
        <span className="font-semibold text-slate-700">Reminder:</span> {invite.reminderStatus}
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/dashboard/settings/integrations" variant="secondary" className="h-9 px-3">
          <Mail className="h-4 w-4" />
          Invite options
        </ButtonLink>
        <ButtonLink href="/dashboard/bot" variant="secondary" className="h-9 px-3">
          <MessageCircle className="h-4 w-4" />
          Bot
        </ButtonLink>
      </div>
    </div>
  );
}
