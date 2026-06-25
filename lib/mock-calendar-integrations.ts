import type { AppointmentInvitation, CalendarIntegration, CalendarSafeAppointment } from "@/types/calendar-integration";

export const calendarIntegrations: CalendarIntegration[] = [
  {
    id: "google-calendar",
    provider: "google",
    name: "Google Calendar",
    description: "Preparación de una conexión OAuth futura para sincronizar bloques de citas.",
    status: "Not connected",
    selectedCalendar: "Calendario principal de la clínica",
    lastSync: "Nunca",
    syncDirection: "CliniControl to Google Calendar",
    enabledFeatures: ["OAuth pendiente", "Selección de calendario", "Vista previa de sincronización"]
  },
  {
    id: "icalendar",
    provider: "icalendar",
    name: "iCalendar / ICS",
    description: "Genera archivos de calendario seguros para invitaciones de ejemplo.",
    status: "Connected",
    selectedCalendar: "Feed demo de CliniControl",
    lastSync: "2026-06-04 09:20",
    enabledFeatures: ["Generar .ics", "Descargar .ics", "Feed público pendiente"]
  },
  {
    id: "whatsapp-bot",
    provider: "whatsapp",
    name: "Bot de citas por WhatsApp",
    description: "Base del bot premium de recordatorios para futuros proveedores de mensajería.",
    status: "Not connected",
    lastSync: "No disponible",
    enabledFeatures: ["Vista previa de plantilla", "Recordatorio con opt-in", "Envío deshabilitado"]
  },
  {
    id: "email-invitations",
    provider: "email",
    name: "Invitaciones por email",
    description: "Invitaciones de cita demo con adjunto ICS opcional.",
    status: "Not connected",
    lastSync: "No disponible",
    enabledFeatures: ["Invitación por email pendiente", "Adjunto ICS pendiente"]
  }
];

export const appointmentInvitations: AppointmentInvitation[] = [
  {
    appointmentId: "apt-001",
    invitePreference: "Send Google Calendar invite",
    calendarInviteStatus: "Pending",
    reminderStatus: "Scheduled",
    location: "Consultorio 2, Clínica CliniControl"
  },
  {
    appointmentId: "apt-002",
    invitePreference: "Generate iCalendar invite",
    calendarInviteStatus: "Sent",
    reminderStatus: "Not scheduled",
    location: "Área de revisión de laboratorio"
  },
  {
    appointmentId: "apt-003",
    invitePreference: "Send WhatsApp reminder",
    calendarInviteStatus: "Not sent",
    reminderStatus: "Sent",
    location: "Consultorio de seguimiento quirúrgico"
  },
  {
    appointmentId: "apt-004",
    invitePreference: "Do not send invite",
    calendarInviteStatus: "Accepted",
    reminderStatus: "Sent",
    location: "Consultorio 1"
  }
];

export const calendarSafeAppointments: CalendarSafeAppointment[] = [
  {
    id: "apt-001",
    patientName: "Alicia Ramirez",
    doctor: "Dr. Morgan",
    type: "Seguimiento",
    startsAt: "2026-06-04T09:00:00-06:00",
    endsAt: "2026-06-04T09:30:00-06:00",
    location: "Consultorio 2, Clínica CliniControl",
    status: "Confirmed"
  }
];

export function getInvitationForAppointment(appointmentId: string) {
  return appointmentInvitations.find((invite) => invite.appointmentId === appointmentId);
}
