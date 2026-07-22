export type ConsentFormValues = {
  consentType: string;
  consentVersion: string;
  consentText: string;
  templateId: string;
};

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function getConsentFormValues(formData: FormData): ConsentFormValues {
  return { consentType: text(formData.get("consent_type")), consentVersion: text(formData.get("consent_version")), consentText: text(formData.get("consent_text")), templateId: text(formData.get("template_id")) };
}

export function validateConsentValues(values: ConsentFormValues) {
  const errors: Record<string, string> = {};
  if (!values.consentType) errors.consentType = "El tipo de consentimiento es obligatorio.";
  if (!values.consentVersion) errors.consentVersion = "La version es obligatoria.";
  if (!values.consentText && !values.templateId) errors.consentText = "El texto del consentimiento es obligatorio.";
  if (values.consentType.length > 160) errors.consentType = "El tipo no puede exceder 160 caracteres.";
  if (values.consentVersion.length > 80) errors.consentVersion = "La version no puede exceder 80 caracteres.";
  if (values.consentText.length > 12000) errors.consentText = "El texto no puede exceder 12,000 caracteres.";
  return { valid: Object.keys(errors).length === 0, errors };
}
