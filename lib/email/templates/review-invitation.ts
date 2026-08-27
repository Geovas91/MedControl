function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character] ?? character);
}
function formatExpiration(expiresAt: string, timeZone: string) {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid review link expiration.");
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone }).format(date);
}

export function buildReviewInvitationEmail(input: {
  clinicName: string;
  doctorDisplayName: string;
  expiresAt: string;
  timeZone: string;
  reviewUrl: string;
}) {
  const clinicName = escapeHtml(input.clinicName);
  const doctorName = escapeHtml(input.doctorDisplayName);
  const expiration = escapeHtml(formatExpiration(input.expiresAt, input.timeZone));
  const reviewUrl = escapeHtml(input.reviewUrl);
  const subjectClinicName = input.clinicName.replace(/[\r\n]+/g, " ").trim();
  return {
    subject: `Solicitud de valoración — ${subjectClinicName}`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:24px auto;background:#fff;padding:32px;border:1px solid #e2e8f0"><h1 style="margin:0 0 16px;font-size:24px">Comparte tu experiencia</h1><p>Hola,</p><p><strong>${clinicName}</strong> te invita a valorar la atención recibida por <strong>${doctorName}</strong>.</p><p>Tu comentario es opcional. No incluyas información médica o sensible.</p><p><a href="${reviewUrl}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Dejar una valoración</a></p><p>El enlace estará disponible hasta el ${expiration} y sólo puede utilizarse una vez.</p><p style="color:#64748b">Enviado mediante CliniControl.</p></main></body></html>`,
    text: `Solicitud de valoración\n\n${input.clinicName} te invita a valorar la atención recibida por ${input.doctorDisplayName}.\n\nAbre la versión HTML de este mensaje y selecciona “Dejar una valoración”.\n\nEl enlace vence el ${formatExpiration(input.expiresAt, input.timeZone)} y sólo puede utilizarse una vez. No incluyas información médica o sensible.\n\nEnviado mediante CliniControl.`
  };
}
