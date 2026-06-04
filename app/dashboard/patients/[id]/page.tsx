import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { patients } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export function generateStaticParams() {
  return patients.map((patient) => ({ id: patient.id }));
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const patient = patients.find((item) => item.id === resolvedParams.id);

  if (!patient) {
    notFound();
  }

  return (
    <>
      <Link href="/dashboard/patients" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic">
        <ArrowLeft className="h-4 w-4" />
        Back to patients
      </Link>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant={patient.status === "Active" ? "green" : patient.status === "Follow-up" ? "amber" : "slate"}>
              {patient.status}
            </Badge>
            <h1 className="mt-4 text-3xl font-bold text-ink">{patient.name}</h1>
            <p className="mt-2 text-slate-500">{patient.age} years · {patient.gender}</p>
          </div>
          <ButtonLink href="/dashboard/appointments/new" variant="secondary">
            <CalendarDays className="h-4 w-4" />
            Schedule visit
          </ButtonLink>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">Phone</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink">
              <Phone className="h-4 w-4 text-clinic" />
              {patient.phone}
            </p>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">Email</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink">
              <Mail className="h-4 w-4 text-clinic" />
              {patient.email}
            </p>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">Next visit</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink">
              <CalendarDays className="h-4 w-4 text-clinic" />
              {formatDate(patient.nextVisit)}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-bold text-ink">Care summary</h2>
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Primary condition</dt>
                <dd className="mt-1 text-slate-700">{patient.condition}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Allergies</dt>
                <dd className="mt-1 text-slate-700">{patient.allergies.length ? patient.allergies.join(", ") : "None recorded"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h2 className="font-bold text-ink">Clinical notes</h2>
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{patient.notes}</p>
          </div>
        </div>
      </section>
    </>
  );
}
