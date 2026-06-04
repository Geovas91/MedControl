import type { AppointmentBotSettings, BotActivityLogItem } from "@/types/appointment-bot";

export const appointmentBotSettings: AppointmentBotSettings = {
  enabled: false,
  requiredPlan: "Premium / Clinic",
  channels: ["WhatsApp", "SMS", "Email"],
  reminderTiming: "24 hours before",
  escalationBehavior: "Notify clinic",
  quietHours: {
    start: "20:00",
    end: "08:00"
  },
  maxRemindersPerPatient: 2,
  messageTemplate:
    "Hello {{patientName}}, this is a reminder for your appointment with {{doctorName}} on {{date}} at {{time}}. Reply 1 to confirm, 2 to reschedule, or 3 to cancel."
};

export const botActivityLog: BotActivityLogItem[] = [
  {
    id: "bot-001",
    appointment: "Follow-up · 2026-06-04 09:00",
    patient: "Alicia Ramirez",
    messageSent: "WhatsApp reminder",
    patientResponse: "1",
    result: "Confirmed",
    timestamp: "2026-06-03 09:00"
  },
  {
    id: "bot-002",
    appointment: "Lab review · 2026-06-04 10:30",
    patient: "Nora Bennett",
    messageSent: "SMS reminder",
    patientResponse: "2",
    result: "Reschedule requested",
    timestamp: "2026-06-03 10:30"
  },
  {
    id: "bot-003",
    appointment: "Post-op check · 2026-06-04 12:00",
    patient: "Marco Silva",
    messageSent: "Email reminder",
    patientResponse: "No response yet",
    result: "Needs follow-up",
    timestamp: "2026-06-03 12:00"
  }
];
