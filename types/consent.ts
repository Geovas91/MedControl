export type ConsentStatus = "Pending" | "Signed" | "Expired" | "Revoked";

export type ConsentType =
  | "General patient consent"
  | "Privacy and data processing"
  | "Telemedicine consent"
  | "Procedure information consent";

export type ConsentRecord = {
  id: string;
  token: string;
  patientId: string;
  patientName: string;
  consentType: ConsentType;
  status: ConsentStatus;
  doctorOrClinic: string;
  validityPeriod: string;
  textVersion: string;
  createdDate: string;
  signedDate?: string;
  signingLink: string;
};

export type ConsentSigningToken = {
  token: string;
  clinicName: string;
  doctorName: string;
  patientName: string;
  consentType: ConsentType;
  consentText: string;
  privacyNotice: string;
};
