import { patientStatuses, type PatientStatus } from "@/lib/patients/query";
import { isValidPatientUuid } from "@/lib/patients/detail";
import type { Database } from "@/types/database";

export const patientCreatorRoles = ["owner", "doctor", "admin", "assistant"] as const;
export const patientSexValues = ["female", "male", "intersex", "unspecified"] as const;
export const patientFlowIntents = ["complete_history", "later"] as const;

export type PatientCreatorRole = Database["public"]["Enums"]["clinic_member_role"];
export type PatientSex = (typeof patientSexValues)[number];
export type PatientFlowIntent = (typeof patientFlowIntents)[number];

export type PatientFormValues = {
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string;
  status: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  genderIdentity: string;
  address: string;
  maritalStatus: string;
  occupation: string;
  educationLevel: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  primaryDoctorId: string;
  flowIntent: string;
};

export type PatientFormField = keyof PatientFormValues;
export type PatientFieldErrors = Partial<Record<PatientFormField, string>>;
export type PatientFormState = { error?: string; fieldErrors?: PatientFieldErrors; values?: PatientFormValues };

export type ValidatedPatientInput = {
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string | null;
  status: PatientStatus;
  email: string | null;
  phone: string;
  dateOfBirth: string;
  sex: PatientSex;
  genderIdentity: string | null;
  address: string | null;
  maritalStatus: string | null;
  occupation: string | null;
  educationLevel: string | null;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  primaryDoctorId: string | null;
  flowIntent: PatientFlowIntent;
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
  const normalized = value.normalize("NFKC").trim();
  const hasPlus = normalized.startsWith("+");
  const digits = normalized.replace(/\D/g, "");
  return digits ? `${hasPlus ? "+" : ""}${digits}` : "";
}

export function getPatientFormValues(formData: FormData): PatientFormValues {
  return {
    firstNames: normalizePatientText(formString(formData, "first_names")),
    paternalSurname: normalizePatientText(formString(formData, "paternal_surname")),
    maternalSurname: normalizePatientText(formString(formData, "maternal_surname")),
    status: formString(formData, "status").trim(),
    email: normalizePatientEmail(formString(formData, "email")),
    phone: normalizePatientPhone(formString(formData, "phone")),
    dateOfBirth: formString(formData, "date_of_birth").trim(),
    sex: formString(formData, "sex").trim(),
    genderIdentity: normalizePatientText(formString(formData, "gender_identity")),
    address: normalizePatientText(formString(formData, "address")),
    maritalStatus: normalizePatientText(formString(formData, "marital_status")),
    occupation: normalizePatientText(formString(formData, "occupation")),
    educationLevel: normalizePatientText(formString(formData, "education_level")),
    emergencyContactName: normalizePatientText(formString(formData, "emergency_contact_name")),
    emergencyContactRelationship: normalizePatientText(formString(formData, "emergency_contact_relationship")),
    emergencyContactPhone: normalizePatientPhone(formString(formData, "emergency_contact_phone")),
    primaryDoctorId: formString(formData, "primary_doctor_id").trim(),
    flowIntent: formString(formData, "flow_intent").trim()
  };
}

export function isCanonicalPatientDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function getOldestAllowedBirthDate(referenceDate: string, maximumAge = 120) {
  if (!isCanonicalPatientDate(referenceDate) || !Number.isInteger(maximumAge) || maximumAge < 0) {
    throw new RangeError("Invalid birth date reference");
  }
  const [referenceYear, month, referenceDay] = referenceDate.split("-").map(Number);
  const year = referenceYear - maximumAge;
  const day = Math.min(referenceDay, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function isValidPatientStatus(value: string): value is PatientStatus {
  return patientStatuses.includes(value as PatientStatus);
}
export function isValidPatientSex(value: string): value is PatientSex {
  return patientSexValues.includes(value as PatientSex);
}
export function getPatientSexOptionLabel(value: PatientSex) {
  return { female: "Femenino", male: "Masculino", intersex: "Intersexual", unspecified: "Sin especificar" }[value];
}
export function canCreatePatients(role: PatientCreatorRole) {
  return patientCreatorRoles.includes(role as (typeof patientCreatorRoles)[number]);
}
export function hasPatientCreatedMessage(value: RawQueryValue) {
  return typeof value === "string" && value === "1";
}

function validateRequiredText(value: string, label: string, max: number) {
  if (!value || !/\p{L}/u.test(value)) return `${label} es obligatorio.`;
  if (value.length > max) return `${label} no puede exceder ${max} caracteres.`;
  return null;
}

export function validatePatientFormValues(values: PatientFormValues, clinicToday: string):
  | { valid: true; data: ValidatedPatientInput; fieldErrors: null }
  | { valid: false; data: null; fieldErrors: PatientFieldErrors } {
  const fieldErrors: PatientFieldErrors = {};
  const firstNamesError = validateRequiredText(values.firstNames, "Los nombres", 120);
  const paternalError = validateRequiredText(values.paternalSurname, "El primer apellido", 80);
  if (firstNamesError) fieldErrors.firstNames = firstNamesError;
  if (paternalError) fieldErrors.paternalSurname = paternalError;
  if (values.maternalSurname.length > 80) fieldErrors.maternalSurname = "El segundo apellido no puede exceder 80 caracteres.";
  if (!isValidPatientStatus(values.status)) fieldErrors.status = "Selecciona un estado válido.";
  if (!isCanonicalPatientDate(values.dateOfBirth)) fieldErrors.dateOfBirth = "Ingresa una fecha de nacimiento válida.";
  else if (values.dateOfBirth > clinicToday) fieldErrors.dateOfBirth = "La fecha de nacimiento no puede estar en el futuro.";
  else if (values.dateOfBirth < getOldestAllowedBirthDate(clinicToday)) fieldErrors.dateOfBirth = "Revisa la fecha de nacimiento.";
  if (!isValidPatientSex(values.sex)) fieldErrors.sex = "Selecciona el sexo al nacimiento.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fieldErrors.email = "Ingresa un correo válido.";
  if (values.email.length > 254) fieldErrors.email = "El correo no puede exceder 254 caracteres.";
  if (values.phone.replace(/\D/g, "").length < 10 || values.phone.replace(/\D/g, "").length > 15) fieldErrors.phone = "Ingresa un teléfono de 10 a 15 dígitos.";
  const emergencyNameError = validateRequiredText(values.emergencyContactName, "El nombre del contacto de emergencia", 160);
  const relationshipError = validateRequiredText(values.emergencyContactRelationship, "El parentesco", 80);
  if (emergencyNameError) fieldErrors.emergencyContactName = emergencyNameError;
  if (relationshipError) fieldErrors.emergencyContactRelationship = relationshipError;
  if (values.emergencyContactPhone.replace(/\D/g, "").length < 10 || values.emergencyContactPhone.replace(/\D/g, "").length > 15) {
    fieldErrors.emergencyContactPhone = "Ingresa un teléfono de 10 a 15 dígitos.";
  }
  if (values.primaryDoctorId && !isValidPatientUuid(values.primaryDoctorId)) fieldErrors.primaryDoctorId = "Selecciona un profesional válido.";
  if (!patientFlowIntents.includes(values.flowIntent as PatientFlowIntent)) fieldErrors.flowIntent = "Selecciona qué deseas hacer después.";
  for (const [field, value, max] of [
    ["genderIdentity", values.genderIdentity, 100], ["address", values.address, 500],
    ["maritalStatus", values.maritalStatus, 80], ["occupation", values.occupation, 120],
    ["educationLevel", values.educationLevel, 120]
  ] as const) if (value.length > max) fieldErrors[field] = `Este campo no puede exceder ${max} caracteres.`;

  if (Object.keys(fieldErrors).length) return { valid: false, data: null, fieldErrors };
  return { valid: true, fieldErrors: null, data: {
    firstNames: values.firstNames, paternalSurname: values.paternalSurname, maternalSurname: values.maternalSurname || null,
    status: values.status as PatientStatus, email: values.email || null, phone: values.phone, dateOfBirth: values.dateOfBirth,
    sex: values.sex as PatientSex, genderIdentity: values.genderIdentity || null, address: values.address || null,
    maritalStatus: values.maritalStatus || null, occupation: values.occupation || null, educationLevel: values.educationLevel || null,
    emergencyContactName: values.emergencyContactName, emergencyContactRelationship: values.emergencyContactRelationship,
    emergencyContactPhone: values.emergencyContactPhone, primaryDoctorId: values.primaryDoctorId || null,
    flowIntent: values.flowIntent as PatientFlowIntent
  }};
}
