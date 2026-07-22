"use client";

import { useActionState } from "react";
import { CalendarClock } from "lucide-react";
import { updateAppointmentAction } from "@/app/dashboard/appointments/[id]/edit/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import {
  appointmentDurations,
  type AppointmentFieldErrors,
  type AppointmentFormField,
  type AppointmentFormState,
  type AppointmentFormValues
} from "@/lib/appointments/create";
import { getAppointmentEditReturnHref } from "@/lib/appointments/edit";
import type {
  AppointmentEditDoctorOption,
  AppointmentEditPatientOption
} from "@/lib/server/update-appointment";

type EditAppointmentFormProps = {
  appointmentId: string;
  initialValues: AppointmentFormValues;
  patients: AppointmentEditPatientOption[];
  doctors: AppointmentEditDoctorOption[];
  timeZone: string;
};

const initialState: AppointmentFormState = {};

function fieldErrorId(field: AppointmentFormField) {
  return `${field}-error`;
}

function FieldError({ field, errors }: { field: AppointmentFormField; errors: AppointmentFieldErrors | undefined }) {
  const message = errors?.[field];
  return message ? <span id={fieldErrorId(field)} className="text-xs font-medium text-rose-700">{message}</span> : null;
}

function patientLabel(patient: AppointmentEditPatientOption) {
  if (patient.status === "inactive") return `${patient.name} (Inactivo)`;
  if (patient.status === "follow_up") return `${patient.name} (Seguimiento)`;
  return patient.name;
}

export function EditAppointmentForm({
  appointmentId,
  initialValues,
  patients,
  doctors,
  timeZone
}: EditAppointmentFormProps) {
  const boundAction = updateAppointmentAction.bind(null, appointmentId);
  const [state, formAction] = useActionState(boundAction, initialState);
  const values = state.values ?? initialValues;
  const canSubmit = patients.length > 0 && doctors.length > 0;

  return (
    <form action={formAction} className="grid gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Datos de la cita</h2>
          <p className="mt-1 text-sm text-slate-500">Fecha y hora se interpretan en {timeZone}.</p>
          <p className="mt-1 text-xs text-slate-500">Los campos con * son obligatorios.</p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>
      ) : null}

      {!canSubmit ? (
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No hay pacientes o profesionales disponibles para editar esta cita.
        </p>
      ) : null}

      <fieldset disabled={!canSubmit} className="grid gap-6 disabled:opacity-70">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Paciente *" htmlFor="patient_id">
            <Select id="patient_id" name="patient_id" defaultValue={values.patientId} required aria-invalid={Boolean(state.fieldErrors?.patientId)} aria-describedby={state.fieldErrors?.patientId ? fieldErrorId("patientId") : undefined}>
              <option value="">Selecciona un paciente</option>
              {patients.map((patient) => <option key={patient.id} value={patient.id}>{patientLabel(patient)}</option>)}
            </Select>
            <FieldError field="patientId" errors={state.fieldErrors} />
          </Field>

          <Field label="Profesional *" htmlFor="doctor_id">
            <Select id="doctor_id" name="doctor_id" defaultValue={values.doctorId} required aria-invalid={Boolean(state.fieldErrors?.doctorId)} aria-describedby={state.fieldErrors?.doctorId ? fieldErrorId("doctorId") : undefined}>
              <option value="">Selecciona un profesional</option>
              {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
            </Select>
            <FieldError field="doctorId" errors={state.fieldErrors} />
          </Field>

          <Field label="Título *" htmlFor="title">
            <Input id="title" name="title" defaultValue={values.title} maxLength={120} required aria-invalid={Boolean(state.fieldErrors?.title)} aria-describedby={state.fieldErrors?.title ? fieldErrorId("title") : undefined} />
            <FieldError field="title" errors={state.fieldErrors} />
          </Field>

          <Field label="Tipo de cita" htmlFor="appointment_type">
            <Input id="appointment_type" name="appointment_type" defaultValue={values.appointmentType} maxLength={80} aria-invalid={Boolean(state.fieldErrors?.appointmentType)} aria-describedby={state.fieldErrors?.appointmentType ? fieldErrorId("appointmentType") : undefined} />
            <FieldError field="appointmentType" errors={state.fieldErrors} />
          </Field>

          <Field label="Fecha *" htmlFor="date">
            <Input id="date" name="date" type="date" defaultValue={values.date} required aria-invalid={Boolean(state.fieldErrors?.date)} aria-describedby={state.fieldErrors?.date ? fieldErrorId("date") : undefined} />
            <FieldError field="date" errors={state.fieldErrors} />
          </Field>

          <Field label="Hora de inicio *" htmlFor="start_time">
            <Input id="start_time" name="start_time" type="time" step={60} defaultValue={values.startTime} required aria-invalid={Boolean(state.fieldErrors?.startTime)} aria-describedby={state.fieldErrors?.startTime ? fieldErrorId("startTime") : undefined} />
            <FieldError field="startTime" errors={state.fieldErrors} />
          </Field>

          <Field label="Duración *" htmlFor="duration">
            <Select id="duration" name="duration" defaultValue={values.duration} required aria-invalid={Boolean(state.fieldErrors?.duration)} aria-describedby={state.fieldErrors?.duration ? fieldErrorId("duration") : undefined}>
              {appointmentDurations.map((duration) => <option key={duration} value={duration}>{duration} minutos</option>)}
            </Select>
            <FieldError field="duration" errors={state.fieldErrors} />
          </Field>

          <Field label="Ubicación" htmlFor="location">
            <Input id="location" name="location" defaultValue={values.location} maxLength={200} aria-invalid={Boolean(state.fieldErrors?.location)} aria-describedby={state.fieldErrors?.location ? fieldErrorId("location") : undefined} />
            <FieldError field="location" errors={state.fieldErrors} />
          </Field>
        </div>

        <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          Se verificará la disponibilidad del profesional sin comparar la cita contra sí misma.
        </p>

        <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row">
          <ButtonLink href={getAppointmentEditReturnHref(initialValues.date)} variant="secondary" className="sm:w-40">Cancelar</ButtonLink>
          <div className="w-full sm:w-52">
            <AuthSubmitButton idleLabel="Guardar cambios" pendingLabel="Guardando..." />
          </div>
        </div>
      </fieldset>
    </form>
  );
}
