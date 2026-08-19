function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

function formatExpiration(expiresAt: string, timeZone: string) {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid consent link expiration.");
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone }).format(date);
}

export function buildConsentSigningEmail(input: {
  clinicName: string;
  consentType: string;
  expiresAt: string;
  timeZone: string;
  signingUrl: string;
}) {
  const clinicName = escapeHtml(input.clinicName);
  const consentType = escapeHtml(input.consentType);
  const expiration = escapeHtml(formatExpiration(input.expiresAt, input.timeZone));
  const signingUrl = escapeHtml(input.signingUrl);
  const safeSubjectClinicName = input.clinicName.replace(/[\r\n]+/g, " ").trim();
  const subject = `Consentimiento pendiente de firma — ${safeSubjectClinicName}`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:24px auto;background:#ffffff;padding:32px;border:1px solid #e2e8f0"><h1 style="margin:0 0 16px;font-size:24px">Consentimiento pendiente de firma</h1><p>Hola,</p><p><strong>${clinicName}</strong> te solicita revisar y firmar el siguiente consentimiento:</p><p style="font-size:18px"><strong>${consentType}</strong></p><p><a href="${signingUrl}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Revisar y firmar consentimiento</a></p><p>El enlace estará disponible hasta el ${expiration}.</p><p><strong>Este enlace es personal. No lo reenvíes.</strong></p><p style="color:#64748b">Enviado mediante CliniControl.</p></main></body></html>`;
  const text = `Consentimiento pendiente de firma\n\n${input.clinicName} te solicita revisar y firmar: ${input.consentType}.\n\nAbre la versión HTML de este mensaje y selecciona “Revisar y firmar consentimiento”.\n\nEl enlace estará disponible hasta el ${formatExpiration(input.expiresAt, input.timeZone)}.\n\nEste enlace es personal. No lo reenvíes.\n\nEnviado mediante CliniControl.`;

  return { subject, html, text };
}
