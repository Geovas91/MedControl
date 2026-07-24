"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";
import { createClinicalPaymentAction } from "@/app/dashboard/payments/new/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select } from "@/components/ui/input";
import {
  clinicalPaymentCurrencies,
  creatablePaymentStatuses,
  manualPaymentMethods,
  type ClinicalPaymentFieldErrors,
  type ClinicalPaymentFormField,
  type ClinicalPaymentFormState
} from "@/lib/payments/create";
import { getClinicalPaymentMethodLabel, getClinicalPaymentStatusLabel } from "@/lib/payments/query";
import type { ClinicalPaymentPatientOption } from "@/lib/server/create-payment";

type CreateClinicalPaymentFormProps = {
  patients: ClinicalPaymentPatientOption[];
  preselectedPatientId: string;
  clinicDate: string;
  clinicTime: string;
  timeZone: string;
};

const initialState: ClinicalPaymentFormState = {};

function fieldErrorId(field: ClinicalPaymentFormField) {
  return `${field}-error`;
}

function FieldError({
  field,
  errors
}: {
  field: ClinicalPaymentFormField;
  errors: ClinicalPaymentFieldErrors | undefined;
}) {
  const message = errors?.[field];

  return message ? (
    <span id={fieldErrorId(field)} className="text-xs font-medium text-rose-700">
      {message}
    </span>
  ) : null;
}

function patientLabel(patient: ClinicalPaymentPatientOption) {
  if (patient.status === "inactive") return `${patient.name} (Inactivo)`;
  if (patient.status === "follow_up") return `${patient.name} (Seguimiento)`;
  return patient.name;
}

export function CreateClinicalPaymentForm({
  patients,
  preselectedPatientId,
  clinicDate,
  clinicTime,
  timeZone
}: CreateClinicalPaymentFormProps) {
  const [state, formAction] = useActionState(createClinicalPaymentAction, initialState);
  const [status, setStatus] = useState(state.values?.status ?? "paid");
  const values = state.values;
  const canSubmit = patients.length > 0;
  const isPaid = status === "paid";

  return (
    <form action={formAction} className="surface-card grid gap-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Pago recibido</h2>
          <p className="mt-1 text-sm text-slate-500">La fecha y hora se interpretan en {timeZone}.</p>
          <p className="mt-1 text-xs text-slate-500">Los campos con * son obligatorios.</p>
        </div>
      </div>

      <p className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-900">
        Este formulario registra un pago recibido fuera de CliniControl. No procesa tarjetas ni transferencias.
      </p>

      {state.error ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      {!canSubmit ? (
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          La clínica no tiene pacientes disponibles. Agrega un paciente antes de registrar un pago.
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
                <option key={patient.id} value={patient.id}>{patientLabel(patient)}</option>
              ))}
            </Select>
            <FieldError field="patientId" errors={state.fieldErrors} />
          </Field>

          <Field label="Concepto *" htmlFor="concept">
            <Input
              id="concept"
              name="concept"
              defaultValue={values?.concept ?? ""}
              minLength={3}
              maxLength={200}
              placeholder="Consulta general"
              required
              aria-invalid={Boolean(state.fieldErrors?.concept)}
              aria-describedby={state.fieldErrors?.concept ? fieldErrorId("concept") : undefined}
            />
            <FieldError field="concept" errors={state.fieldErrors} />
          </Field>

          <Field label="Monto *" htmlFor="amount">
            <Input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              defaultValue={values?.amount ?? ""}
              placeholder="650.00"
              required
              aria-invalid={Boolean(state.fieldErrors?.amount)}
              aria-describedby={state.fieldErrors?.amount ? fieldErrorId("amount") : undefined}
            />
            <FieldError field="amount" errors={state.fieldErrors} />
          </Field>

          <Field label="Moneda *" htmlFor="currency">
            <Select
              id="currency"
              name="currency"
              defaultValue={values?.currency ?? "MXN"}
              required
              aria-invalid={Boolean(state.fieldErrors?.currency)}
              aria-describedby={state.fieldErrors?.currency ? fieldErrorId("currency") : undefined}
            >
              {clinicalPaymentCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </Select>
            <FieldError field="currency" errors={state.fieldErrors} />
          </Field>

          <Field label="Método de pago *" htmlFor="payment_method">
            <Select
              id="payment_method"
              name="payment_method"
              defaultValue={values?.paymentMethod ?? "cash"}
              required
              aria-invalid={Boolean(state.fieldErrors?.paymentMethod)}
              aria-describedby={state.fieldErrors?.paymentMethod ? fieldErrorId("paymentMethod") : undefined}
            >
              {manualPaymentMethods.map((method) => (
                <option key={method} value={method}>{getClinicalPaymentMethodLabel(method)}</option>
              ))}
            </Select>
            <FieldError field="paymentMethod" errors={state.fieldErrors} />
          </Field>

          <Field label="Estado *" htmlFor="status">
            <Select
              id="status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              required
              aria-invalid={Boolean(state.fieldErrors?.status)}
              aria-describedby={state.fieldErrors?.status ? fieldErrorId("status") : undefined}
            >
              {creatablePaymentStatuses.map((paymentStatus) => (
                <option key={paymentStatus} value={paymentStatus}>{getClinicalPaymentStatusLabel(paymentStatus)}</option>
              ))}
            </Select>
            <FieldError field="status" errors={state.fieldErrors} />
          </Field>

          <Field label={isPaid ? "Fecha del pago *" : "Fecha del pago"} htmlFor="paid_date">
            <Input
              id="paid_date"
              name="paid_date"
              type="date"
              defaultValue={values?.paidDate || clinicDate}
              max={clinicDate}
              required={isPaid}
              disabled={!isPaid}
              aria-invalid={Boolean(state.fieldErrors?.paidDate)}
              aria-describedby={state.fieldErrors?.paidDate ? fieldErrorId("paidDate") : undefined}
            />
            <FieldError field="paidDate" errors={state.fieldErrors} />
          </Field>

          <Field label={isPaid ? "Hora del pago *" : "Hora del pago"} htmlFor="paid_time">
            <Input
              id="paid_time"
              name="paid_time"
              type="time"
              step={60}
              defaultValue={values?.paidTime || clinicTime}
              required={isPaid}
              disabled={!isPaid}
              aria-invalid={Boolean(state.fieldErrors?.paidTime)}
              aria-describedby={state.fieldErrors?.paidTime ? fieldErrorId("paidTime") : undefined}
            />
            <FieldError field="paidTime" errors={state.fieldErrors} />
          </Field>
        </div>

        {!isPaid ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Los pagos pendientes se guardan sin fecha de pago. No se registra una fecha esperada.
          </p>
        ) : null}

        <div className="ml-auto w-full sm:w-64">
          <AuthSubmitButton idleLabel="Registrar pago" pendingLabel="Registrando pago..." />
        </div>
      </fieldset>
    </form>
  );
}
