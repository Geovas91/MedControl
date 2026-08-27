function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character] ?? character);
}
export function buildAppointmentReminderEmail(input: {
  clinicName: string;
  doctorDisplayName: string;
  startsAt: string;
  timeZone: string;
}) {
  const formatted = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long", timeStyle: "short", timeZone: input.timeZone
  }).format(new Date(input.startsAt));
  const clinic = escapeHtml(input.clinicName);
  const doctor = escapeHtml(input.doctorDisplayName);
  const date = escapeHtml(formatted);
  return {
    subject: `Recordatorio de cita — ${input.clinicName.replace(/[\r\n]+/g, " ").trim()}`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:24px auto;background:#fff;padding:32px;border:1px solid #e2e8f0"><h1 style="margin:0 0 16px;font-size:24px">Recordatorio de cita</h1><p>Hola,</p><p><strong>${clinic}</strong> te recuerda tu cita con <strong>${doctor}</strong> el <strong>${date}</strong>.</p><p>Si necesitas cambiarla, comunícate directamente con la clínica.</p><p style="color:#64748b">Este mensaje contiene únicamente información operativa de agenda.</p></main></body></html>`,
    text: `Recordatorio de cita\n\n${input.clinicName} te recuerda tu cita con ${input.doctorDisplayName} el ${formatted}.\n\nSi necesitas cambiarla, comunícate directamente con la clínica.\n\nEste mensaje contiene únicamente información operativa de agenda.`
  };
}
