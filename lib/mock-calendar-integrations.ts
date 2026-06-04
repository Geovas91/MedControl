import type { AppointmentInvitation, CalendarIntegration, CalendarSafeAppointment } from "@/types/calendar-integration";

export const calendarIntegrations: CalendarIntegration[] = [
  {
    id: "google-calendar",
    provider: "google",
    name: "Google Calendar",
    description: "Prepare a future OAuth connection for syncing appointment blocks.",
    status: "Not connected",
    selectedCalendar: "Primary clinic calendar",
    lastSync: "Never",
    syncDirection: "MedControl to Google Calendar",
    enabledFeatures: ["OAuth placeholder", "Calendar selection", "Sync direction preview"]
  },
  {
    id: "icalendar",
    provider: "icalendar",
    name: "iCalendar / ICS",
    description: "Generate safe calendar files for mock appointment invitations.",
    status: "Connected",
    selectedCalendar: "MedControl feed placeholder",
    lastSync: "2026-06-04 09:20",
    enabledFeatures: ["Generate .ics", "Download .ics", "Public feed placeholder"]
  },
  {
    id: "whatsapp-bot",
    provider: "whatsapp",
    name: "WhatsApp appointment bot",
    description: "Premium reminder bot scaffold for future messaging providers.",
    status: "Not connected",
    lastSync: "Not available",
    enabledFeatures: ["Template preview", "Opt-in reminder", "Delivery disabled"]
  },
  {
    id: "email-invitations",
    provider: "email",
    name: "Email invitations",
    description: "Mock appointment invitation emails with optional ICS attachment.",
    status: "Not connected",
    lastSync: "Not available",
    enabledFeatures: ["Email invite placeholder", "ICS attachment placeholder"]
  }
];

export const appointmentInvitations: AppointmentInvitation[] = [
  {
    appointmentId: "apt-001",
    invitePreference: "Send Google Calendar invite",
    calendarInviteStatus: "Pending",
    reminderStatus: "Scheduled",
    location: "Room 2, MedControl Clinic"
  },
  {
    appointmentId: "apt-002",
    invitePreference: "Generate iCalendar invite",
    calendarInviteStatus: "Sent",
    reminderStatus: "Not scheduled",
    location: "Lab review desk"
  },
  {
    appointmentId: "apt-003",
    invitePreference: "Send WhatsApp reminder",
    calendarInviteStatus: "Not sent",
    reminderStatus: "Sent",
    location: "Surgery follow-up room"
  },
  {
    appointmentId: "apt-004",
    invitePreference: "Do not send invite",
    calendarInviteStatus: "Accepted",
    reminderStatus: "Sent",
    location: "Exam room 1"
  }
];

export const calendarSafeAppointments: CalendarSafeAppointment[] = [
  {
    id: "apt-001",
    patientName: "Alicia Ramirez",
    doctor: "Dr. Morgan",
    type: "Follow-up",
    startsAt: "2026-06-04T09:00:00-06:00",
    endsAt: "2026-06-04T09:30:00-06:00",
    location: "Room 2, MedControl Clinic",
    status: "Confirmed"
  }
];

export function getInvitationForAppointment(appointmentId: string) {
  return appointmentInvitations.find((invite) => invite.appointmentId === appointmentId);
}
