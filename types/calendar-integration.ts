export type CalendarProvider = "google" | "icalendar" | "whatsapp" | "email";

export type CalendarConnectionStatus = "Connected" | "Not connected";

export type CalendarSyncDirection =
  | "MedControl to Google Calendar"
  | "Google Calendar to MedControl"
  | "Two-way sync";

export type InvitationStatus = "Not sent" | "Sent" | "Accepted" | "Declined" | "Pending" | "Failed";

export type ReminderStatus = "Not scheduled" | "Scheduled" | "Sent" | "Failed";

export type CalendarIntegration = {
  id: string;
  provider: CalendarProvider;
  name: string;
  description: string;
  status: CalendarConnectionStatus;
  selectedCalendar?: string;
  lastSync?: string;
  syncDirection?: CalendarSyncDirection;
  enabledFeatures: string[];
};

export type AppointmentInvitePreference =
  | "Send Google Calendar invite"
  | "Generate iCalendar invite"
  | "Send email invite"
  | "Send WhatsApp reminder"
  | "Do not send invite";

export type AppointmentInvitation = {
  appointmentId: string;
  invitePreference: AppointmentInvitePreference;
  calendarInviteStatus: InvitationStatus;
  reminderStatus: ReminderStatus;
  location: string;
  onlineLink?: string;
};

export type CalendarSafeAppointment = {
  id: string;
  patientName: string;
  doctor: string;
  type: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: "Confirmed" | "Waiting" | "Completed";
};
