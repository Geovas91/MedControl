export type ConsentFormValues = {
  consentType: string;
  consentVersion: string;
  consentText: string;
};

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function getConsentFormValues(formData: FormData): ConsentFormValues {
  return {
    consentType: text(formData.get("consent_type")),
    consentVersion: text(formData.get("consent_version")),
    consentText: text(formData.get("consent_text"))
  };
}

export function validateConsentValues(values: ConsentFormValues) {
  const errors: Record<string, string> = {};
  if (!values.consentType) errors.consentType = "El tipo de consentimiento es obligatorio.";
  if (!values.consentVersion) errors.consentVersion = "La versión es obligatoria.";
  if (!values.consentText) errors.consentText = "El texto del consentimiento es obligatorio.";
  if (values.consentType.length > 160) errors.consentType = "El tipo no puede exceder 160 caracteres.";
  if (values.consentVersion.length > 80) errors.consentVersion = "La versión no puede exceder 80 caracteres.";
  if (values.consentText.length > 12_000) errors.consentText = "El texto no puede exceder 12,000 caracteres.";
  return { valid: Object.keys(errors).length === 0, errors };
}
