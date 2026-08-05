import { canCreatePatients, type PatientFormValues, type ValidatedPatientInput } from "@/lib/patients/create";
import type { Database } from "@/types/database";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientUpdate = Database["public"]["Tables"]["patients"]["Update"];
type RawQueryValue = string | string[] | undefined;

export type EditablePatient = Pick<PatientRow,
  "id" | "full_name" | "first_names" | "paternal_surname" | "maternal_surname" | "status" | "email" | "phone" |
  "date_of_birth" | "sex" | "gender_identity" | "address" | "marital_status" | "occupation" | "education_level" |
  "emergency_contact_name" | "emergency_contact_relationship" | "emergency_contact_phone" | "primary_doctor_id"
>;

export const canEditPatients = canCreatePatients;

export function getPatientEditInitialValues(patient: EditablePatient): PatientFormValues {
  return {
    firstNames: patient.first_names,
    paternalSurname: patient.paternal_surname ?? "",
    maternalSurname: patient.maternal_surname ?? "",
    status: patient.status,
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    dateOfBirth: patient.date_of_birth ?? "",
    sex: patient.sex ?? "unspecified",
    genderIdentity: patient.gender_identity ?? "",
    address: patient.address ?? "",
    maritalStatus: patient.marital_status ?? "",
    occupation: patient.occupation ?? "",
    educationLevel: patient.education_level ?? "",
    emergencyContactName: patient.emergency_contact_name ?? "",
    emergencyContactRelationship: patient.emergency_contact_relationship ?? "",
    emergencyContactPhone: patient.emergency_contact_phone ?? "",
    primaryDoctorId: patient.primary_doctor_id ?? "",
    flowIntent: "later"
  };
}

export function buildPatientUpdate(input: ValidatedPatientInput): PatientUpdate {
  return {
    full_name: [input.firstNames, input.paternalSurname, input.maternalSurname].filter(Boolean).join(" "),
    first_names: input.firstNames, paternal_surname: input.paternalSurname, maternal_surname: input.maternalSurname,
    status: input.status, email: input.email, phone: input.phone, date_of_birth: input.dateOfBirth, sex: input.sex,
    gender_identity: input.genderIdentity, address: input.address, marital_status: input.maritalStatus,
    occupation: input.occupation, education_level: input.educationLevel,
    emergency_contact_name: input.emergencyContactName,
    emergency_contact_relationship: input.emergencyContactRelationship,
    emergency_contact_phone: input.emergencyContactPhone,
    primary_doctor_id: input.primaryDoctorId
  };
}

export function hasPatientUpdatedMessage(value: RawQueryValue) {
  return typeof value === "string" && value === "1";
}
