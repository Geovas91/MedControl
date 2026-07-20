import { patientStatuses, type PatientStatus } from "@/lib/patients/query";
import { isValidPatientUuid } from "@/lib/patients/detail";
import type { Database } from "@/types/database";

export const patientCreatorRoles = ["owner", "doctor", "admin"] as const;
export const patientSexValues = ["unspecified", "female", "male"] as const;

export type PatientCreatorRole = Database["public"]["Enums"]["clinic_member_role"];
export type PatientSex = (typeof patientSexValues)[number];

export type PatientFormValues = {
  fullName: string;
  status: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  relevantHistory: string;
  primaryDoctorId: string;
};

export type PatientFormField = keyof PatientFormValues;
export type PatientFieldErrors = Partial<Record<PatientFormField, string>>;

export type PatientFormState = {
  error?: string;
  fieldErrors?: PatientFieldErrors;
  values?: PatientFormValues;
};

export type ValidatedPatientInput = {
  fullName: string;
  status: PatientStatus;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  sex: PatientSex | null;
  relevantHistory: string | null;
  primaryDoctorId: string | null;
};

type RawQueryValue = string | string[] | undefined;

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function normalizePatientText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizePatientEmail(value: string) {
  return normalizePatientText(value).toLocaleLowerCase("en-US");
}

export function normalizePatientPhone(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function getPatientFormValues(formData: FormData): PatientFormValues {
  return {
    fullName: normalizePatientText(formString(formData, "full_name")),
    status: formString(formData, "status").trim(),
    email: normalizePatientEmail(formString(formData, "email")),
    phone: normalizePatientPhone(formString(formData, "phone")),
    dateOfBirth: formString(formData, "date_of_birth").trim(),
    sex: formString(formData, "sex").trim(),
    relevantHistory: normalizePatientText(formString(formData, "relevant_history")),
    primaryDoctorId: formString(formData, "primary_doctor_id").trim()
  };
}

export function isCanonicalPatientDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function getOldestAllowedBirthDate(referenceDate: string, maximumAge = 120) {
  if (!isCanonicalPatientDate(referenceDate) || !Number.isInteger(maximumAge) || maximumAge < 0) {
    throw new RangeError("Invalid birth date reference");
  }

  const [referenceYear, month, referenceDay] = referenceDate.split("-").map(Number);
  const year = referenceYear - maximumAge;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(referenceDay, daysInMonth);

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function isValidPatientStatus(value: string): value is PatientStatus {
  return patientStatuses.includes(value as PatientStatus);
}

export function isValidPatientSex(value: string): value is PatientSex {
  return patientSexValues.includes(value as PatientSex);
}

export function getPatientSexOptionLabel(value: PatientSex) {
  const labels: Record<PatientSex, string> = {
    unspecified: "Sin especificar",
    female: "Femenino",
    male: "Masculino"
  };

  return labels[value];
}

export function canCreatePatients(role: PatientCreatorRole) {
  return patientCreatorRoles.includes(role as (typeof patientCreatorRoles)[number]);
}

export function hasPatientCreatedMessage(value: RawQueryValue) {
  return typeof value === "string" && value === "1";
}

export function validatePatientFormValues(
  values: PatientFormValues,
  clinicToday: string
):
  | { valid: true; data: ValidatedPatientInput; fieldErrors: null }
  | { valid: false; data: null; fieldErrors: PatientFieldErrors } {
  const fieldErrors: PatientFieldErrors = {};

  if (values.fullName.length < 2 || !/\p{L}/u.test(values.fullName)) {
    fieldErrors.fullName = "Escribe un nombre válido de al menos 2 caracteres.";
  } else if (values.fullName.length > 120) {
    fieldErrors.fullName = "El nombre no puede exceder 120 caracteres.";
  }

  if (!isValidPatientStatus(values.status)) {
    fieldErrors.status = "Selecciona un estado válido.";
  }

  if (values.email) {
    if (values.email.length > 254) {
      fieldErrors.email = "El correo no puede exceder 254 caracteres.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      fieldErrors.email = "Escribe un correo válido.";
    }
  }

  if (values.phone) {
    const digitCount = (values.phone.match(/\d/g) ?? []).length;

    if (values.phone.length > 32) {
      fieldErrors.phone = "El teléfono no puede exceder 32 caracteres.";
    } else if (!/^\+?[\d\s().-]+$/.test(values.phone) || digitCount < 7 || digitCount > 20) {
      fieldErrors.phone = "Escribe un teléfono válido con al menos 7 dígitos.";
    }
  }

  if (values.dateOfBirth) {
    if (!isCanonicalPatientDate(values.dateOfBirth)) {
      fieldErrors.dateOfBirth = "Selecciona una fecha de nacimiento válida.";
    } else if (!isCanonicalPatientDate(clinicToday)) {
      fieldErrors.dateOfBirth = "No fue posible validar la fecha de nacimiento.";
    } else if (values.dateOfBirth > clinicToday) {
      fieldErrors.dateOfBirth = "La fecha de nacimiento no puede estar en el futuro.";
    } else if (values.dateOfBirth < getOldestAllowedBirthDate(clinicToday)) {
      fieldErrors.dateOfBirth = "La fecha de nacimiento supera la edad máxima de 120 años.";
    }
  }

  if (values.sex && !isValidPatientSex(values.sex)) {
    fieldErrors.sex = "Selecciona una opción válida.";
  }

  if (values.relevantHistory.length > 2000) {
    fieldErrors.relevantHistory = "Los antecedentes no pueden exceder 2,000 caracteres.";
  }

  if (values.primaryDoctorId && !isValidPatientUuid(values.primaryDoctorId)) {
    fieldErrors.primaryDoctorId = "Selecciona un médico válido.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { valid: false, data: null, fieldErrors };
  }

  return {
    valid: true,
    fieldErrors: null,
    data: {
      fullName: values.fullName,
      status: values.status as PatientStatus,
      email: values.email || null,
      phone: values.phone || null,
      dateOfBirth: values.dateOfBirth || null,
      sex: (values.sex || null) as PatientSex | null,
      relevantHistory: values.relevantHistory || null,
      primaryDoctorId: values.primaryDoctorId || null
    }
  };
}
