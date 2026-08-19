export const compatiblePatientEmail = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

export type ConsentEmailAvailability =
  | { available: true; recipient: string; signingUrl: string }
  | { available: false; reason: "missing_email" | "missing_url" | "signed" | "cancelled" | "revoked" | "expired" | "used" };

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
