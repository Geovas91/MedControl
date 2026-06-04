import type { ConsentRecord, ConsentSigningToken } from "@/types/consent";

export const consentRecords: ConsentRecord[] = [
  {
    id: "con-001",
    token: "demo-token",
    patientId: "pat-001",
    patientName: "Alicia Ramirez",
    consentType: "General patient consent",
    status: "Pending",
    doctorOrClinic: "MedControl Clinic",
    validityPeriod: "12 months",
    textVersion: "v1.0-demo",
    createdDate: "2026-06-01",
    signingLink: "/consent/sign/demo-token"
  },
  {
    id: "con-002",
    token: "signed-token",
    patientId: "pat-003",
    patientName: "Nora Bennett",
    consentType: "Privacy and data processing",
    status: "Signed",
    doctorOrClinic: "Dr. Morgan",
    validityPeriod: "24 months",
    textVersion: "v1.0-demo",
    createdDate: "2026-05-28",
    signedDate: "2026-05-29",
    signingLink: "/consent/sign/signed-token"
  },
  {
    id: "con-003",
    token: "expired-token",
    patientId: "pat-002",
    patientName: "Marco Silva",
    consentType: "Telemedicine consent",
    status: "Expired",
    doctorOrClinic: "MedControl Clinic",
    validityPeriod: "30 days",
    textVersion: "v0.9-demo",
    createdDate: "2026-04-12",
    signedDate: "2026-04-13",
    signingLink: "/consent/sign/expired-token"
  }
];

export const demoSigningToken: ConsentSigningToken = {
  token: "demo-token",
  clinicName: "MedControl Clinic",
  doctorName: "Dr. Morgan",
  patientName: "Alicia Ramirez",
  consentType: "General patient consent",
  consentText:
    "This mock consent explains that the clinic may collect basic administrative and health-related information needed to coordinate care. This is demo copy for product design only.",
  privacyNotice:
    "Only use fictional information in this demo. Real consent flows require reviewed legal language, secure identity checks, audit trails, and appropriate data protection controls."
};
