import {
  canCreatePatients,
  type PatientFormValues,
  type ValidatedPatientInput
} from "@/lib/patients/create";
import type { Database } from "@/types/database";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientUpdate = Database["public"]["Tables"]["patients"]["Update"];
type RawQueryValue = string | string[] | undefined;

export type EditablePatient = Pick<
  PatientRow,
  | "id"
  | "full_name"
  | "status"
  | "email"
  | "phone"
  | "date_of_birth"
  | "sex"
  | "relevant_history"
  | "primary_doctor_id"
>;

export const canEditPatients = canCreatePatients;

export function getPatientEditInitialValues(patient: EditablePatient): PatientFormValues {
  return {
    fullName: patient.full_name,
    status: patient.status,
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    dateOfBirth: patient.date_of_birth ?? "",
    sex: patient.sex ?? "unspecified",
    relevantHistory: patient.relevant_history ?? "",
    primaryDoctorId: patient.primary_doctor_id ?? ""
  };
}

export function buildPatientUpdate(input: ValidatedPatientInput): PatientUpdate {
  return {
    full_name: input.fullName,
    status: input.status,
    email: input.email,
    phone: input.phone,
    date_of_birth: input.dateOfBirth,
    sex: input.sex,
    relevant_history: input.relevantHistory,
    primary_doctor_id: input.primaryDoctorId
  };
}

export function hasPatientUpdatedMessage(value: RawQueryValue) {
  return typeof value === "string" && value === "1";
}
