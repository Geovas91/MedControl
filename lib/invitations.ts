import { createHash } from "crypto";

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function maskInvitationEmail(email: string) {
  const [local, domain] = email.split("@");
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : "";
}
