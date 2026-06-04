import { CalendarPlus, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { appointments } from "@/lib/mock-data";

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
            <article key={appointment.id} className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-[120px_1fr_auto] md:items-center">
              <div className="flex items-center gap-2 font-bold text-ink">
                <Clock className="h-4 w-4 text-clinic" />
                {appointment.time}
              </div>
              <div>
                <h2 className="font-bold text-ink">{appointment.patientName}</h2>
                <p className="mt-1 text-sm text-slate-500">{appointment.type} · {appointment.doctor}</p>
              </div>
              <Badge variant={appointment.status === "Completed" ? "green" : appointment.status === "Waiting" ? "amber" : "teal"}>
                {appointment.status}
              </Badge>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
