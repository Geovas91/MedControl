import { combineClinicDateTime } from "@/lib/appointments/create";
import { isCanonicalPaymentUuid, type ClinicalPaymentStatus } from "@/lib/payments/query";
import type { Database } from "@/types/database";

export const clinicalPaymentCurrencies = ["MXN", "USD"] as const;
export const manualPaymentMethods = ["cash", "card", "transfer", "deposit", "other"] as const;
export const creatablePaymentStatuses = ["paid", "pending"] as const satisfies readonly ClinicalPaymentStatus[];
export const clinicalPaymentCreatorRoles = ["owner", "admin"] as const;

export type ClinicalPaymentCurrency = (typeof clinicalPaymentCurrencies)[number];
export type ManualPaymentMethod = (typeof manualPaymentMethods)[number];
export type CreatablePaymentStatus = (typeof creatablePaymentStatuses)[number];
export type ClinicalPaymentCreatorRole = Database["public"]["Enums"]["clinic_member_role"];

export type ClinicalPaymentFormValues = {
  patientId: string;
  concept: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  status: string;
  paidDate: string;
  paidTime: string;
};

export type ClinicalPaymentFormField = keyof ClinicalPaymentFormValues;
export type ClinicalPaymentFieldErrors = Partial<Record<ClinicalPaymentFormField, string>>;

export type ClinicalPaymentFormState = {
  error?: string;
  fieldErrors?: ClinicalPaymentFieldErrors;
  values?: ClinicalPaymentFormValues;
};

export type ValidatedClinicalPaymentInput = {
  patientId: string;
  concept: string;
  amount: number;
  currency: ClinicalPaymentCurrency;
  paymentMethod: ManualPaymentMethod;
  status: CreatablePaymentStatus;
  paidDate: string;
  paidTime: string;
};

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function normalizeClinicalPaymentConcept(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function getClinicalPaymentFormValues(formData: FormData): ClinicalPaymentFormValues {
  return {
    patientId: formString(formData, "patient_id").trim(),
    concept: normalizeClinicalPaymentConcept(formString(formData, "concept")),
    amount: formString(formData, "amount").trim(),
    currency: formString(formData, "currency").trim().toUpperCase(),
    paymentMethod: formString(formData, "payment_method").trim(),
    status: formString(formData, "status").trim(),
    paidDate: formString(formData, "paid_date").trim(),
    paidTime: formString(formData, "paid_time").trim()
  };
}

export function parseClinicalPaymentAmount(value: string) {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) {
    return null;
  }

  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");

  if (cents <= BigInt(0) || cents > BigInt("999999999999")) {
    return null;
  }

  return Number(cents) / 100;
}

export function canCreateClinicalPayments(role: ClinicalPaymentCreatorRole) {
  return clinicalPaymentCreatorRoles.includes(role as (typeof clinicalPaymentCreatorRoles)[number]);
}

export function hasClinicalPaymentCreatedMessage(value: string | string[] | undefined) {
  return value === "1";
}

export function validateClinicalPaymentFormValues(
  values: ClinicalPaymentFormValues
):
  | { valid: true; data: ValidatedClinicalPaymentInput; fieldErrors: null }
  | { valid: false; data: null; fieldErrors: ClinicalPaymentFieldErrors } {
  const fieldErrors: ClinicalPaymentFieldErrors = {};
  const amount = parseClinicalPaymentAmount(values.amount);

  if (!isCanonicalPaymentUuid(values.patientId)) {
    fieldErrors.patientId = "Selecciona un paciente válido.";
  }

  if (values.concept.length < 3 || !/[\p{L}\p{N}]/u.test(values.concept)) {
    fieldErrors.concept = "Escribe un concepto de al menos 3 caracteres con letras o números.";
  } else if (values.concept.length > 200) {
    fieldErrors.concept = "El concepto no puede exceder 200 caracteres.";
  }

  if (amount === null) {
    fieldErrors.amount = "Usa un monto mayor a cero, sin exponentes y con máximo dos decimales.";
  }

  if (!clinicalPaymentCurrencies.includes(values.currency as ClinicalPaymentCurrency)) {
    fieldErrors.currency = "Selecciona una moneda permitida.";
  }

  if (!manualPaymentMethods.includes(values.paymentMethod as ManualPaymentMethod)) {
    fieldErrors.paymentMethod = "Selecciona un método de pago permitido.";
  }

  if (!creatablePaymentStatuses.includes(values.status as CreatablePaymentStatus)) {
    fieldErrors.status = "Selecciona un estado inicial permitido.";
  }

  if (values.status === "paid" && (!values.paidDate || !values.paidTime)) {
    fieldErrors.paidDate = !values.paidDate ? "Selecciona la fecha del pago." : undefined;
    fieldErrors.paidTime = !values.paidTime ? "Selecciona la hora del pago." : undefined;
  }

  if (Object.keys(fieldErrors).length > 0 || amount === null) {
    return { valid: false, data: null, fieldErrors };
  }

  return {
    valid: true,
    fieldErrors: null,
    data: {
      patientId: values.patientId,
      concept: values.concept,
      amount,
      currency: values.currency as ClinicalPaymentCurrency,
      paymentMethod: values.paymentMethod as ManualPaymentMethod,
      status: values.status as CreatablePaymentStatus,
      paidDate: values.paidDate,
      paidTime: values.paidTime
    }
  };
}

export function resolveClinicalPaymentTimestamp(
  status: CreatablePaymentStatus,
  date: string,
  time: string,
  timeZone: string,
  now = new Date()
) {
  if (status === "pending") {
    return { state: "valid" as const, iso: null };
  }

  const result = combineClinicDateTime(date, time, timeZone);

  if (result.state !== "valid") {
    return result;
  }

  if (Date.parse(result.iso) > now.getTime()) {
    return { state: "future" as const, iso: null };
  }

  return result;
}

export function getClinicLocalPaymentDefaults(timeZone: string, referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(referenceDate).map((part) => [part.type, part.value]));

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}
