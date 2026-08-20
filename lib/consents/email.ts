export const compatiblePatientEmail = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

export type ConsentEmailAvailability =
  | { available: true; recipient: string; signingUrl: string }
  | { available: false; reason: "missing_email" | "missing_url" | "signed" | "cancelled" | "revoked" | "expired" | "used" };

export type ConsentEmailResult =
  | { state: "sent"; recipient: string }
  | { state: "missing_recipient" | "invalid_link" | "invalid_state" | "forbidden" | "unauthenticated" | "not_found" | "provider_unavailable" | "query_failed" | "delivery_failed" };

export type ConsentEmailActionOutcome =
  | { kind: "not_found" }
  | { kind: "redirect_login" }
  | { kind: "state"; state: { error?: string; sentTo?: string } };

export function getConsentEmailActionOutcome(result: ConsentEmailResult): ConsentEmailActionOutcome {
  if (result.state === "not_found") return { kind: "not_found" };
  if (result.state === "unauthenticated") return { kind: "redirect_login" };
  if (result.state === "sent") return { kind: "state", state: { sentTo: result.recipient } };
  if (result.state === "missing_recipient") return { kind: "state", state: { error: "Este paciente no tiene correo electrónico registrado." } };
  if (result.state === "invalid_link") return { kind: "state", state: { error: "El enlace de firma ya no es válido. Genera un enlace nuevo e intenta nuevamente." } };
  if (result.state === "invalid_state") return { kind: "state", state: { error: "Este consentimiento ya no puede enviarse por correo." } };
  if (result.state === "forbidden") return { kind: "state", state: { error: "No tienes permisos para enviar este consentimiento." } };
  return { kind: "state", state: { error: "No pudimos enviar el consentimiento. Intenta nuevamente." } };
}

export type ConsentEmailDialogPhase = "idle" | "confirming" | "sending" | "error" | "sent";

export function getConsentEmailDialogView(input: {
  open: boolean;
  pending: boolean;
  emailState: { error?: string; sentTo?: string };
}) {
  const phase: ConsentEmailDialogPhase = input.emailState.sentTo
    ? "sent"
    : input.pending
      ? "sending"
      : input.open && input.emailState.error
        ? "error"
        : input.open
          ? "confirming"
          : "idle";

  return {
    phase,
    error: phase === "error" ? input.emailState.error : undefined,
    submitDisabled: phase === "sending",
    submitLabel: phase === "sending" ? "Enviando…" : "Confirmar envío",
    shouldClose: phase === "sent"
  };
}

export function getConsentEmailAvailability(input: {
  status: "pending" | "signed" | "expired" | "cancelled";
  patientEmail?: string | null;
  signingUrl?: string;
  signingTokenExpiresAt?: string | null;
  signingTokenUsedAt?: string | null;
  signingTokenRevokedAt?: string | null;
  now?: Date;
}): ConsentEmailAvailability {
  if (input.status === "signed") return { available: false, reason: "signed" };
  if (input.status === "cancelled") return { available: false, reason: "cancelled" };
  if (input.status === "expired") return { available: false, reason: "expired" };
  const recipient = input.patientEmail?.trim().toLowerCase() ?? "";
  if (!compatiblePatientEmail.test(recipient)) return { available: false, reason: "missing_email" };
  if (input.signingTokenRevokedAt) return { available: false, reason: "revoked" };
  if (input.signingTokenUsedAt) return { available: false, reason: "used" };
  if (!input.signingTokenExpiresAt || new Date(input.signingTokenExpiresAt).getTime() <= (input.now ?? new Date()).getTime()) {
    return { available: false, reason: "expired" };
  }
  if (!input.signingUrl) return { available: false, reason: "missing_url" };
  return { available: true, recipient, signingUrl: input.signingUrl };
}
