import type { ClinicMemberRole } from "@/lib/supabase/clinic-members";

const roleLabels: Record<Exclude<ClinicMemberRole, "owner">, string> = {
  admin: "Administrador",
  doctor: "Médico",
  assistant: "Asistente"
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

export function getInvitationRoleLabel(role: Exclude<ClinicMemberRole, "owner">) {
  return roleLabels[role];
}

export function buildMemberInvitationEmail(input: {
  clinicName: string;
  role: Exclude<ClinicMemberRole, "owner">;
  expiresAt: string;
  invitationUrl: string;
}) {
  const clinicName = escapeHtml(input.clinicName);
  const role = escapeHtml(getInvitationRoleLabel(input.role));
  const expiration = escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(input.expiresAt)));
  const invitationUrl = escapeHtml(input.invitationUrl);
  const subject = "Te invitaron a una clínica en CliniControl";
  const text = `Te invitaron a ${input.clinicName} como ${getInvitationRoleLabel(input.role)}.\n\nAcepta la invitación antes del ${new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(input.expiresAt))}:\n${input.invitationUrl}\n\nEste enlace es personal. Si no esperabas esta invitación, puedes ignorar este correo.\n\nCliniControl`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:24px auto;background:#ffffff;padding:32px;border:1px solid #e2e8f0"><h1 style="margin:0 0 16px;font-size:24px">Invitación a ${clinicName}</h1><p>Te invitaron como <strong>${role}</strong>.</p><p>Esta invitación vence el ${expiration}.</p><p style="margin:28px 0"><a href="${invitationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:bold">Aceptar invitación</a></p><p style="word-break:break-all">${invitationUrl}</p><p>Este enlace es personal. Si no esperabas esta invitación, puedes ignorar este correo.</p><p style="color:#64748b">CliniControl</p></main></body></html>`;

  return { subject, html, text };
}
