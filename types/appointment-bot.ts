export type BotChannel = "WhatsApp" | "SMS" | "Email";

export type BotReminderTiming = "24 hours before" | "48 hours before" | "Same day";

export type BotEscalationBehavior = "Notify clinic" | "Mark as needs follow-up" | "Do nothing";

export type AppointmentBotSettings = {
  enabled: boolean;
  requiredPlan: "Premium / Clinic";
  channels: BotChannel[];
  reminderTiming: BotReminderTiming;
  escalationBehavior: BotEscalationBehavior;
  quietHours: {
    start: string;
    end: string;
  };
  maxRemindersPerPatient: number;
  messageTemplate: string;
};

export type BotActivityResult = "Confirmed" | "Needs follow-up" | "Reschedule requested" | "Cancelled" | "No response";

export type BotActivityLogItem = {
  id: string;
  appointment: string;
  patient: string;
  messageSent: string;
  patientResponse: string;
  result: BotActivityResult;
  timestamp: string;
};
