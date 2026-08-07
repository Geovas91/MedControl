export type AppointmentEmailKind = "confirmation" | "rescheduled" | "cancelled" | "restored";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

function formatAppointmentDate(startsAt: string, timeZone: string) {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid appointment date.");
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone
  }).format(date);
}

const copy: Record<AppointmentEmailKind, { subject: string; heading: string; intro: string }> = {
  confirmation: {
    subject: "Confirmación de cita",
    heading: "Tu cita está programada",
    intro: "La clínica registró una cita para ti."
  },
  rescheduled: {
    subject: "Tu cita fue reprogramada",
    heading: "Nuevo horario de tu cita",
    intro: "La clínica actualizó el horario o los datos de acceso de tu cita."
  },
  cancelled: {
    subject: "Tu cita fue cancelada",
    heading: "Cita cancelada",
    intro: "La clínica canceló esta cita. El archivo adjunto permite retirarla de tu calendario."
  },
  restored: {
    subject: "Tu cita fue restaurada",
    heading: "Tu cita vuelve a estar programada",
    intro: "La clínica restauró esta cita con su horario actual."
  }
};

export function buildAppointmentInvitationEmail(input: {
  kind: AppointmentEmailKind;
  clinicName: string;
  doctorName?: string | null;
  startsAt: string;
  timeZone: string;
  location?: string | null;
  meetingUrl?: string | null;
}) {
  const selected = copy[input.kind];
  const date = formatAppointmentDate(input.startsAt, input.timeZone);
  const details = [
    `Fecha y hora: ${date}`,
    input.doctorName ? `Profesional: ${input.doctorName}` : null,
    input.location ? `Ubicación: ${input.location}` : null,
    input.meetingUrl ? `Enlace: ${input.meetingUrl}` : null
  ].filter((value): value is string => Boolean(value));
  const text = `${selected.heading}\n\n${selected.intro}\n\n${input.clinicName}\n${details.join("\n")}\n\nSe adjunta un archivo de calendario compatible con Google Calendar, Outlook y Apple Calendar.\n\nCliniControl`;
  const htmlDetails = details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:24px auto;background:#ffffff;padding:32px;border:1px solid #e2e8f0"><h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(selected.heading)}</h1><p>${escapeHtml(selected.intro)}</p><p><strong>${escapeHtml(input.clinicName)}</strong></p><ul>${htmlDetails}</ul><p>Se adjunta un archivo de calendario compatible con Google Calendar, Outlook y Apple Calendar.</p><p style="color:#64748b">CliniControl</p></main></body></html>`;

  return {
    subject: `${selected.subject} - ${input.clinicName}`,
    html,
    text
  };
}
