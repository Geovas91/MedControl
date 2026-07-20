"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { createPatientAction } from "@/app/dashboard/patients/new/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  getPatientSexOptionLabel,
  patientSexValues,
  type PatientFieldErrors,
  type PatientFormField,
  type PatientFormState
} from "@/lib/patients/create";
import { getPatientStatusLabel, patientStatuses } from "@/lib/patients/query";
import type { PatientDoctorOption } from "@/lib/server/create-patient";

type CreatePatientFormProps = {
  doctors: PatientDoctorOption[];
  clinicToday: string;
};

const initialState: PatientFormState = {};

function fieldErrorId(field: PatientFormField) {
  return `${field}-error`;
}

function FieldError({ field, errors }: { field: PatientFormField; errors: PatientFieldErrors | undefined }) {
  const message = errors?.[field];

  return message ? (
    <span id={fieldErrorId(field)} className="text-xs font-medium text-rose-700">
      {message}
    </span>
  ) : null;
}

export function CreatePatientForm({ doctors, clinicToday }: CreatePatientFormProps) {
  const [state, formAction] = useActionState(createPatientAction, initialState);
  const values = state.values;

  return (
    <form action={formAction} className="grid gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Datos del paciente</h2>
          <p className="mt-1 text-sm text-slate-500">Captura solo la información necesaria para su registro.</p>
          <p className="mt-1 text-xs text-slate-500">Los campos con * son obligatorios.</p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre completo *" htmlFor="full_name">
          <Input
            id="full_name"
            name="full_name"
            defaultValue={values?.fullName ?? ""}
            minLength={2}
            maxLength={120}
            autoComplete="name"
            required
            aria-invalid={Boolean(state.fieldErrors?.fullName)}
            aria-describedby={state.fieldErrors?.fullName ? fieldErrorId("fullName") : undefined}
          />
          <FieldError field="fullName" errors={state.fieldErrors} />
        </Field>

        <Field label="Estado *" htmlFor="status">
          <Select
            id="status"
            name="status"
            defaultValue={values?.status ?? "active"}
            required
            aria-invalid={Boolean(state.fieldErrors?.status)}
            aria-describedby={state.fieldErrors?.status ? fieldErrorId("status") : undefined}
          >
            {patientStatuses.map((status) => (
              <option key={status} value={status}>
                {getPatientStatusLabel(status)}
              </option>
            ))}
          </Select>
          <FieldError field="status" errors={state.fieldErrors} />
        </Field>

        <Field label="Correo" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={values?.email ?? ""}
            maxLength={254}
            autoComplete="email"
            placeholder="paciente@example.com"
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? fieldErrorId("email") : undefined}
          />
          <FieldError field="email" errors={state.fieldErrors} />
        </Field>

        <Field label="Teléfono" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={values?.phone ?? ""}
            maxLength={32}
            autoComplete="tel"
            placeholder="+52 55 0000 0000"
            aria-invalid={Boolean(state.fieldErrors?.phone)}
            aria-describedby={state.fieldErrors?.phone ? fieldErrorId("phone") : undefined}
          />
          <FieldError field="phone" errors={state.fieldErrors} />
        </Field>

        <Field label="Fecha de nacimiento" htmlFor="date_of_birth">
          <Input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            defaultValue={values?.dateOfBirth ?? ""}
            max={clinicToday}
            aria-invalid={Boolean(state.fieldErrors?.dateOfBirth)}
            aria-describedby={state.fieldErrors?.dateOfBirth ? fieldErrorId("dateOfBirth") : undefined}
          />
          <FieldError field="dateOfBirth" errors={state.fieldErrors} />
        </Field>

        <Field label="Sexo" htmlFor="sex">
          <Select
            id="sex"
            name="sex"
            defaultValue={values?.sex ?? "unspecified"}
            aria-invalid={Boolean(state.fieldErrors?.sex)}
            aria-describedby={state.fieldErrors?.sex ? fieldErrorId("sex") : undefined}
          >
            {patientSexValues.map((sex) => (
              <option key={sex} value={sex}>
                {getPatientSexOptionLabel(sex)}
              </option>
            ))}
          </Select>
          <FieldError field="sex" errors={state.fieldErrors} />
        </Field>

        <Field label="Médico principal" htmlFor="primary_doctor_id">
          <Select
            id="primary_doctor_id"
            name="primary_doctor_id"
            defaultValue={values?.primaryDoctorId ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.primaryDoctorId)}
            aria-describedby={
              state.fieldErrors?.primaryDoctorId ? fieldErrorId("primaryDoctorId") : undefined
            }
          >
            <option value="">Sin médico principal</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
          <FieldError field="primaryDoctorId" errors={state.fieldErrors} />
        </Field>
      </div>

      <Field label="Antecedentes relevantes" htmlFor="relevant_history">
        <Textarea
          id="relevant_history"
          name="relevant_history"
          defaultValue={values?.relevantHistory ?? ""}
          maxLength={2000}
          rows={6}
          placeholder="Información clínica breve y necesaria"
          aria-invalid={Boolean(state.fieldErrors?.relevantHistory)}
          aria-describedby={
            state.fieldErrors?.relevantHistory ? fieldErrorId("relevantHistory") : undefined
          }
        />
        <FieldError field="relevantHistory" errors={state.fieldErrors} />
      </Field>

      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
        Los antecedentes son información clínica protegida. Evita incluir datos que no sean necesarios para la atención.
      </p>

      <div className="ml-auto w-full sm:w-64">
        <AuthSubmitButton idleLabel="Crear paciente" pendingLabel="Creando paciente..." />
      </div>
    </form>
  );
}
