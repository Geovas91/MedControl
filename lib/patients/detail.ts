import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

export function isValidPatientUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day, date };
}

export function calculatePatientAge(dateOfBirth: string | null, onDate: string) {
  if (!dateOfBirth) {
    return null;
  }

  const birth = parseDateOnly(dateOfBirth);
  const reference = parseDateOnly(onDate);

  if (!birth || !reference || birth.date > reference.date) {
    return null;
  }

  let age = reference.year - birth.year;

  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) {
    age -= 1;
  }

  return age;
}

export function formatPatientDateOnly(value: string | null, locale = "es-MX") {
  if (!value) {
    return "Sin registro";
  }

  const parsed = parseDateOnly(value);

  if (!parsed) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed.date);
}

export function formatPatientTimestamp(value: string | null, timeZone: string, locale = "es-MX") {
  if (!value) {
    return "Sin registro";
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone
    }).format(new Date(value));
  } catch {
    return "Sin registro";
  }
}

export function formatPatientCurrency(amount: number, currency: string, locale = "es-MX") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

export function getPatientSexLabel(value: string | null) {
  const labels: Record<string, string> = {
    female: "Femenino",
    male: "Masculino",
    unspecified: "Sin especificar"
  };

  return value ? labels[value] ?? value : "Sin registro";
}

export function getAppointmentStatusLabel(status: Enums["appointment_status"]) {
  const labels: Record<Enums["appointment_status"], string> = {
    scheduled: "Programada",
    confirmed: "Confirmada",
    waiting: "En espera",
    completed: "Completada",
    cancelled: "Cancelada"
  };

  return labels[status];
}

export function getPaymentStatusLabel(status: Enums["payment_status"]) {
  const labels: Record<Enums["payment_status"], string> = {
    pending: "Pendiente",
    paid: "Pagado",
    cancelled: "Cancelado",
    refunded: "Reembolsado"
  };

  return labels[status];
}

export function getMedicalNoteStatusLabel(status: Enums["medical_note_status"]) {
  const labels: Record<Enums["medical_note_status"], string> = {
    draft: "Borrador",
    finalized: "Finalizada",
    archived: "Archivada"
  };

  return labels[status];
}

export function getConsentStatusLabel(status: Enums["consent_status"]) {
  const labels: Record<Enums["consent_status"], string> = {
    pending: "Pendiente",
    signed: "Firmado",
    expired: "Expirado",
    revoked: "Revocado"
  };

  return labels[status];
}
