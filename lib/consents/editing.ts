export type EditableConsentValues = {
  consentType: string;
  consentVersion: string;
  consentText: string;
};

export const UNSAVED_CONSENT_MESSAGE = "Guarda los cambios antes de generar un enlace de firma.";

export function hasUnsavedConsentChanges(current: EditableConsentValues, persisted: EditableConsentValues) {
  return current.consentType !== persisted.consentType
    || current.consentVersion !== persisted.consentVersion
    || current.consentText !== persisted.consentText;
}

export function canEditIssuedConsent(status: "pending" | "signed" | "cancelled", hasActiveLink: boolean) {
  return status === "pending" && !hasActiveLink;
}
