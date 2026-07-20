import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  CreditCard,
  FileSignature,
  Mail,
  Phone
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { canCreateAppointments } from "@/lib/appointments/create";
import {
  calculatePatientAge,
  formatPatientCurrency,
  formatPatientDateOnly,
  formatPatientTimestamp,
  getAppointmentStatusLabel,
  getConsentStatusLabel,
  getMedicalNoteStatusLabel,
  getPatientSexLabel,
  getPaymentStatusLabel
} from "@/lib/patients/detail";
import { getPatientStatusLabel, type PatientStatus } from "@/lib/patients/query";
import {
  getPatientDetailForActiveTenant,
  type PatientDetailAppointment
} from "@/lib/server/patient-detail";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Enums = Database["public"]["Enums"];

function patientStatusVariant(status: PatientStatus) {
  if (status === "active") {
    return "green" as const;
  }

  if (status === "follow_up") {
    return "amber" as const;
  }

  return "slate" as const;
}

function relatedStatusVariant(
  status:
    | Enums["appointment_status"]
    | Enums["payment_status"]
    | Enums["medical_note_status"]
    | Enums["consent_status"]
) {
  if (status === "completed" || status === "paid" || status === "finalized" || status === "signed") {
    return "green" as const;
  }

  if (status === "waiting" || status === "pending" || status === "draft") {
    return "amber" as const;
  }

  if (status === "scheduled" || status === "confirmed") {
    return "teal" as const;
  }

  return "slate" as const;
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">{children}</p>;
}

function PatientDetailUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <Link
        href="/dashboard/patients"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a pacientes
      </Link>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </section>
    </>
  );
}

function AppointmentList({
  appointments,
  timeZone,
  emptyLabel
}: {
  appointments: PatientDetailAppointment[];
  timeZone: string;
  emptyLabel: string;
}) {
  if (appointments.length === 0) {
    return <EmptySection>{emptyLabel}</EmptySection>;
  }

  return (
    <div className="grid gap-3">
      {appointments.map((appointment) => (
        <article key={appointment.id} className="rounded-md border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-ink">{appointment.title}</p>
              <p className="mt-1 text-sm text-slate-500">
                {formatPatientTimestamp(appointment.starts_at, timeZone)}
                {appointment.appointment_type ? ` · ${appointment.appointment_type}` : ""}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Médico: {appointment.doctorName ?? "Sin registro"}
              </p>
            </div>
            <Badge variant={relatedStatusVariant(appointment.status)}>
              {getAppointmentStatusLabel(appointment.status)}
            </Badge>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPatientDetailForActiveTenant(id);

  if (result.state === "invalid_id" || result.state === "not_found") {
    notFound();
  }

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    return (
      <PatientDetailUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para consultar este paciente."
      />
    );
  }

  if (result.state === "error") {
    return (
      <PatientDetailUnavailable
        title="No fue posible cargar el paciente"
        description="La información clínica no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  const { data } = result;
  const { patient } = data;
  const timeZone = data.tenant.clinic.timezone;
  const age = calculatePatientAge(patient.date_of_birth, data.localDate);

  return (
    <>
      <Link
        href="/dashboard/patients"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-clinic"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a pacientes
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant={patientStatusVariant(patient.status)}>{getPatientStatusLabel(patient.status)}</Badge>
            <h1 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">{patient.full_name}</h1>
            <p className="mt-2 text-slate-500">
              {age === null ? "Edad sin registro" : `${age} años`} · {getPatientSexLabel(patient.sex)}
            </p>
          </div>
          {canCreateAppointments(data.tenant.membership.role) ? (
            <ButtonLink href={`/dashboard/appointments/new?patient=${patient.id}`} className="shrink-0">
              <CalendarPlus className="h-4 w-4" />
              Agendar cita
            </ButtonLink>
          ) : null}
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 rounded-md bg-slate-50 p-4">
            <dt className="text-sm font-semibold text-slate-500">Teléfono</dt>
            <dd className="mt-2 flex items-center gap-2 text-sm text-ink">
              <Phone className="h-4 w-4 shrink-0 text-clinic" />
              <span className="break-all">{patient.phone ?? "Sin registro"}</span>
            </dd>
          </div>
          <div className="min-w-0 rounded-md bg-slate-50 p-4">
            <dt className="text-sm font-semibold text-slate-500">Correo</dt>
            <dd className="mt-2 flex items-center gap-2 text-sm text-ink">
              <Mail className="h-4 w-4 shrink-0 text-clinic" />
              <span className="break-all">{patient.email ?? "Sin registro"}</span>
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <dt className="text-sm font-semibold text-slate-500">Fecha de nacimiento</dt>
            <dd className="mt-2 text-sm text-ink">{formatPatientDateOnly(patient.date_of_birth)}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <dt className="text-sm font-semibold text-slate-500">Fecha de alta</dt>
            <dd className="mt-2 text-sm text-ink">{formatPatientTimestamp(patient.created_at, timeZone)}</dd>
          </div>
        </dl>

        <div className="mt-8">
          <h2 className="font-bold text-ink">Antecedentes relevantes</h2>
          <p className="mt-3 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {patient.relevant_history ?? "Sin registro"}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-clinic" />
          <h2 className="text-lg font-bold text-ink">Citas</h2>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold text-ink">Próximas citas</h3>
            <AppointmentList
              appointments={data.upcomingAppointments}
              timeZone={timeZone}
              emptyLabel="No hay próximas citas registradas."
            />
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-ink">Citas recientes</h3>
            <AppointmentList
              appointments={data.recentAppointments}
              timeZone={timeZone}
              emptyLabel="No hay citas anteriores registradas."
            />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-clinic" />
            <h2 className="text-lg font-bold text-ink">Pagos recientes</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {data.payments.length === 0 ? (
              <EmptySection>No hay pagos registrados para este paciente.</EmptySection>
            ) : (
              data.payments.map((payment) => (
                <article key={payment.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{payment.concept ?? "Sin concepto"}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatPatientCurrency(payment.amount, payment.currency)} ·{" "}
                        {formatPatientTimestamp(payment.paid_at ?? payment.created_at, timeZone)}
                      </p>
                    </div>
                    <Badge variant={relatedStatusVariant(payment.status)}>
                      {getPaymentStatusLabel(payment.status)}
                    </Badge>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-clinic" />
            <h2 className="text-lg font-bold text-ink">Notas médicas recientes</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {data.medicalNotes.length === 0 ? (
              <EmptySection>No hay notas médicas registradas para este paciente.</EmptySection>
            ) : (
              data.medicalNotes.map((note) => (
                <article key={note.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{note.specialty ?? "Especialidad sin registro"}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatPatientTimestamp(note.finalized_at ?? note.created_at, timeZone)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {note.clinical_impression ?? "Sin impresión clínica"}
                      </p>
                    </div>
                    <Badge variant={relatedStatusVariant(note.status)}>
                      {getMedicalNoteStatusLabel(note.status)}
                    </Badge>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-clinic" />
          <h2 className="text-lg font-bold text-ink">Consentimientos</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {data.consents.length === 0 ? (
            <div className="md:col-span-2">
              <EmptySection>No hay consentimientos registrados para este paciente.</EmptySection>
            </div>
          ) : (
            data.consents.map((consent) => (
              <article key={consent.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-ink">{consent.consent_type}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {consent.signed_at
                        ? `Firmado: ${formatPatientTimestamp(consent.signed_at, timeZone)}`
                        : consent.expires_at
                          ? `Vence: ${formatPatientTimestamp(consent.expires_at, timeZone)}`
                          : `Creado: ${formatPatientTimestamp(consent.created_at, timeZone)}`}
                    </p>
                  </div>
                  <Badge variant={relatedStatusVariant(consent.status)}>
                    {getConsentStatusLabel(consent.status)}
                  </Badge>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
