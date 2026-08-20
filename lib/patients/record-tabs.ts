const auditActionLabels: Record<string, string> = {
  patient_and_record_created: "Paciente y expediente creados",
  consent_created: "Consentimiento creado",
  consent_updated: "Consentimiento actualizado",
  consent_cancelled: "Consentimiento cancelado",
  consent_signed: "Consentimiento firmado",
  consent_legacy_status_migrated: "Estado histórico de consentimiento actualizado",
  consent_pdf_generated: "PDF de consentimiento generado",
  consent_pdf_generation_failed: "Falló la generación del PDF",
  consent_pdf_downloaded: "PDF de consentimiento descargado",
  consent_email_sent: "Enlace de firma enviado por correo",
  consent_email_failed: "Falló el envío del enlace de firma",
  consent_email_delivery_unknown: "Entrega del correo sin confirmar",
  created: "Registro clínico creado",
  updated: "Registro clínico actualizado",
  archived: "Registro clínico archivado",
  voided: "Registro clínico anulado",
  status_changed: "Estado clínico actualizado"
};

const auditResourceLabels: Record<string, string> = {
  patient: "Paciente",
  patients: "Datos del paciente",
  consent: "Consentimiento",
  consent_document: "PDF de consentimiento",
  clinical_records: "Expediente clínico",
  initial_clinical_histories: "Historia clínica inicial",
  clinical_history_identification: "Identificación clínica",
  family_medical_histories: "Antecedentes heredofamiliares",
  pathological_histories: "Antecedentes patológicos",
  non_pathological_histories: "Antecedentes no patológicos",
  initial_clinical_assessments: "Valoración clínica inicial",
  clinical_alerts: "Alerta clínica",
  vital_sign_measurements: "Signos vitales"
};

export function getPatientAuditActionLabel(action: string) {
  return auditActionLabels[action] ?? "Actividad registrada";
}

export function getPatientAuditResourceLabel(resourceType: string) {
  return auditResourceLabels[resourceType] ?? "Expediente del paciente";
}

export function getPatientAuditResourceHref({
  patientId,
  resourceType,
  relatedConsentId
}: {
  patientId: string;
  resourceType: string;
  relatedConsentId: string | null;
}) {
  if ((resourceType === "consent" || resourceType === "consent_document") && relatedConsentId) {
    return `/dashboard/patients/${patientId}/consents/${relatedConsentId}`;
  }
  if (resourceType === "vital_sign_measurements") return `/dashboard/patients/${patientId}?tab=signos-vitales`;
  if (
    resourceType === "clinical_records"
    || resourceType === "initial_clinical_histories"
    || resourceType === "clinical_history_identification"
    || resourceType === "family_medical_histories"
    || resourceType === "pathological_histories"
    || resourceType === "non_pathological_histories"
    || resourceType === "initial_clinical_assessments"
    || resourceType === "clinical_alerts"
  ) return `/dashboard/patients/${patientId}/clinical-record`;
  return `/dashboard/patients/${patientId}`;
}
