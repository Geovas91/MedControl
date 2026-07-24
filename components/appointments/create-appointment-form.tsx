"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { createAppointmentAction } from "@/app/dashboard/appointments/new/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select } from "@/components/ui/input";
import {
  appointmentDurations,
  type AppointmentFieldErrors,
  type AppointmentFormField,
  type AppointmentFormState
} from "@/lib/appointments/create";
import { getAppointmentStatusLabel } from "@/lib/appointments/query";
import type {
  AppointmentDoctorOption,
  AppointmentPatientOption
} from "@/lib/server/create-appointment";

type CreateAppointmentFormProps = {
  patients: AppointmentPatientOption[];
  doctors: AppointmentDoctorOption[];
  preselectedPatientId: string;
  clinicToday: string;
  timeZone: string;
};

const initialState: AppointmentFormState = {};

function fieldErrorId(field: AppointmentFormField) {
  return `${field}-error`;
}

function FieldError({
  field,
  errors
}: {
  field: AppointmentFormField;
  errors: AppointmentFieldErrors | undefined;
}) {
  const message = errors?.[field];

  return message ? (
    <span id={fieldErrorId(field)} className="text-xs font-medium text-rose-700">
      {message}
    </span>
  ) : null;
}

function patientLabel(patient: AppointmentPatientOption) {
  if (patient.status === "inactive") {
    return `${patient.name} (Inactivo)`;
  }

  if (patient.status === "follow_up") {
    return `${patient.name} (Seguimiento)`;
  }

  return patient.name;
}

export function CreateAppointmentForm({
  patients,
  doctors,
  preselectedPatientId,
  clinicToday,
  timeZone
}: CreateAppointmentFormProps) {
  const [state, formAction] = useActionState(createAppointmentAction, initialState);
  const values = state.values;
  const canSubmit = patients.length > 0 && doctors.length > 0;
  const defaultDoctorId = doctors.length === 1 ? doctors[0].id : "";

  return (
    <form action={formAction} className="surface-card grid gap-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic">
          <CalendarPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Datos de la cita</h2>
          <p className="mt-1 text-sm text-slate-500">
            La fecha y hora se interpretan en la zona horaria {timeZone}.
          </p>
          <p className="mt-1 text-xs text-slate-500">Los campos con * son obligatorios.</p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      {!canSubmit ? (
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {patients.length === 0
            ? "La clínica no tiene pacientes disponibles. Agrega un paciente antes de crear una cita."
            : "La clínica no tiene médicos configurados para agendar citas."}
        </p>
      ) : null}

      <fieldset disabled={!canSubmit} className="grid gap-6 disabled:opacity-70">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Paciente *" htmlFor="patient_id">
            <Select
              id="patient_id"
              name="patient_id"
              defaultValue={values?.patientId ?? preselectedPatientId}
              required
              aria-invalid={Boolean(state.fieldErrors?.patientId)}
              aria-describedby={state.fieldErrors?.patientId ? fieldErrorId("patientId") : undefined}
            >
              <option value="">Selecciona un paciente</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patientLabel(patient)}
                </option>
              ))}
            </Select>
            <FieldError field="patientId" errors={state.fieldErrors} />
          </Field>

          <Field label="Médico *" htmlFor="doctor_id">
            <Select
              id="doctor_id"
              name="doctor_id"
              defaultValue={values?.doctorId ?? defaultDoctorId}
              required
              aria-invalid={Boolean(state.fieldErrors?.doctorId)}
              aria-describedby={state.fieldErrors?.doctorId ? fieldErrorId("doctorId") : undefined}
            >
              <option value="">Selecciona un médico</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </Select>
            <FieldError field="doctorId" errors={state.fieldErrors} />
          </Field>

          <Field label="Título *" htmlFor="title">
            <Input
              id="title"
              name="title"
              defaultValue={values?.title ?? ""}
              maxLength={120}
              placeholder="Consulta de seguimiento"
              required
              aria-invalid={Boolean(state.fieldErrors?.title)}
              aria-describedby={state.fieldErrors?.title ? fieldErrorId("title") : undefined}
            />
            <FieldError field="title" errors={state.fieldErrors} />
          </Field>

          <Field label="Tipo de cita" htmlFor="appointment_type">
            <Input
              id="appointment_type"
              name="appointment_type"
              defaultValue={values?.appointmentType ?? ""}
              maxLength={80}
              placeholder="Consulta, seguimiento o revisión"
              aria-invalid={Boolean(state.fieldErrors?.appointmentType)}
              aria-describedby={
                state.fieldErrors?.appointmentType ? fieldErrorId("appointmentType") : undefined
              }
            />
            <FieldError field="appointmentType" errors={state.fieldErrors} />
          </Field>

          <Field label="Fecha *" htmlFor="date">
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={values?.date ?? clinicToday}
              required
              aria-invalid={Boolean(state.fieldErrors?.date)}
              aria-describedby={state.fieldErrors?.date ? fieldErrorId("date") : undefined}
            />
            <FieldError field="date" errors={state.fieldErrors} />
          </Field>

          <Field label="Hora de inicio *" htmlFor="start_time">
            <Input
              id="start_time"
              name="start_time"
              type="time"
              defaultValue={values?.startTime ?? "09:00"}
              step={60}
              required
              aria-invalid={Boolean(state.fieldErrors?.startTime)}
              aria-describedby={state.fieldErrors?.startTime ? fieldErrorId("startTime") : undefined}
            />
            <FieldError field="startTime" errors={state.fieldErrors} />
          </Field>

          <Field label="Duración *" htmlFor="duration">
            <Select
              id="duration"
              name="duration"
              defaultValue={values?.duration ?? "30"}
              required
              aria-invalid={Boolean(state.fieldErrors?.duration)}
              aria-describedby={state.fieldErrors?.duration ? fieldErrorId("duration") : undefined}
            >
              {appointmentDurations.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} minutos
                </option>
              ))}
            </Select>
            <FieldError field="duration" errors={state.fieldErrors} />
          </Field>

          <Field label="Estado inicial *" htmlFor="status">
            <Select
              id="status"
              name="status"
              defaultValue={values?.status ?? "scheduled"}
              required
              aria-invalid={Boolean(state.fieldErrors?.status)}
              aria-describedby={state.fieldErrors?.status ? fieldErrorId("status") : undefined}
            >
              <option value="scheduled">{getAppointmentStatusLabel("scheduled")}</option>
              <option value="confirmed">{getAppointmentStatusLabel("confirmed")}</option>
            </Select>
            <FieldError field="status" errors={state.fieldErrors} />
          </Field>

          <Field label="Ubicación" htmlFor="location">
            <Input
              id="location"
              name="location"
              defaultValue={values?.location ?? ""}
              maxLength={200}
              placeholder="Consultorio 2"
              aria-invalid={Boolean(state.fieldErrors?.location)}
              aria-describedby={state.fieldErrors?.location ? fieldErrorId("location") : undefined}
            />
            <FieldError field="location" errors={state.fieldErrors} />
          </Field>

          <Field label="Enlace de videollamada" htmlFor="meeting_url">
            <Input
              id="meeting_url"
              name="meeting_url"
              type="url"
              defaultValue={values?.meetingUrl ?? ""}
              maxLength={500}
              placeholder="https://..."
              aria-invalid={Boolean(state.fieldErrors?.meetingUrl)}
              aria-describedby={state.fieldErrors?.meetingUrl ? fieldErrorId("meetingUrl") : undefined}
            />
            <FieldError field="meetingUrl" errors={state.fieldErrors} />
          </Field>
        </div>

        <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          CliniControl comprobará que el médico no tenga otra cita activa en el mismo horario.
        </p>

        <div className="ml-auto w-full sm:w-64">
          <AuthSubmitButton idleLabel="Crear cita" pendingLabel="Creando cita..." />
        </div>
      </fieldset>
    </form>
  );
}
