import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, Mail, Phone, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { patients } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { getMedicalNotesForPatient } from "@/lib/mock-medical-notes";

const patientStatusLabels: Record<string, string> = {
  Active: "Activo",
  "Follow-up": "Seguimiento",
  Inactive: "Inactivo"
};

const noteStatusLabels: Record<string, string> = {
  Draft: "Borrador",
  Finalized: "Finalizada"
};

export function generateStaticParams() {
  return patients.map((patient) => ({ id: patient.id }));
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const patient = patients.find((item) => item.id === resolvedParams.id);
  const patientNotes = getMedicalNotesForPatient(resolvedParams.id);

  if (!patient) {
    notFound();
  }

  return (
    <>
      <Link href="/dashboard/patients" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic">
        <ArrowLeft className="h-4 w-4" />
        Volver a pacientes
      </Link>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant={patient.status === "Active" ? "green" : patient.status === "Follow-up" ? "amber" : "slate"}>
              {patientStatusLabels[patient.status] ?? patient.status}
            </Badge>
            <h1 className="mt-4 text-3xl font-bold text-ink">{patient.name}</h1>
            <p className="mt-2 text-slate-500">{patient.age} años · {patient.gender}</p>
          </div>
          <ButtonLink href="/dashboard/appointments/new" variant="secondary">
            <CalendarDays className="h-4 w-4" />
            Agendar visita
          </ButtonLink>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">Teléfono</p>
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
            <p className="text-sm font-semibold text-slate-500">Próxima visita</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink">
              <CalendarDays className="h-4 w-4 text-clinic" />
              {formatDate(patient.nextVisit)}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-bold text-ink">Resumen de atención</h2>
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Motivo principal</dt>
                <dd className="mt-1 text-slate-700">{patient.condition}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Alergias</dt>
                <dd className="mt-1 text-slate-700">{patient.allergies.length ? patient.allergies.join(", ") : "Sin registro"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h2 className="font-bold text-ink">Notas clínicas</h2>
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{patient.notes}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-clinic" />
              <h2 className="text-lg font-bold text-ink">Notas médicas</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Notas demo recientes para este paciente ficticio.</p>
          </div>
          <ButtonLink href="/dashboard/medical-notes/new" variant="secondary">
            <Plus className="h-4 w-4" />
            Crear nota médica
          </ButtonLink>
        </div>

        <div className="mt-5 grid gap-3">
          {patientNotes.map((note) => (
            <article key={note.id} className="rounded-md border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-ink">{note.templateName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {note.specialty} · {formatDate(note.date)} · {note.doctorName}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{note.clinicalImpression}</p>
                </div>
                <Badge variant={note.status === "Finalized" ? "green" : "amber"}>
                  {noteStatusLabels[note.status] ?? note.status}
                </Badge>
              </div>
            </article>
          ))}
          {patientNotes.length === 0 ? (
            <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay notas médicas demo.</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
