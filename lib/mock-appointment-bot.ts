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
    "Hola {{patientName}}, te recordamos tu cita con {{doctorName}} el {{date}} a las {{time}}. Responde 1 para confirmar, 2 para reprogramar o 3 para cancelar."
};

export const botActivityLog: BotActivityLogItem[] = [
  {
    id: "bot-001",
    appointment: "Seguimiento · 2026-06-04 09:00",
    patient: "Alicia Ramirez",
    messageSent: "Recordatorio por WhatsApp",
    patientResponse: "1",
    result: "Confirmed",
    timestamp: "2026-06-03 09:00"
  },
  {
    id: "bot-002",
    appointment: "Revisión de laboratorio · 2026-06-04 10:30",
    patient: "Nora Bennett",
    messageSent: "Recordatorio por SMS",
    patientResponse: "2",
    result: "Reschedule requested",
    timestamp: "2026-06-03 10:30"
  },
  {
    id: "bot-003",
    appointment: "Revisión posoperatoria · 2026-06-04 12:00",
    patient: "Marco Silva",
    messageSent: "Recordatorio por email",
    patientResponse: "Sin respuesta todavía",
    result: "Needs follow-up",
    timestamp: "2026-06-03 12:00"
  }
];
