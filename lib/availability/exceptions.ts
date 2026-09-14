export type ExceptionType = "available" | "unavailable";
export type AvailabilityException = { id: string; clinic_member_id: string; exception_type: ExceptionType; start_at: string; end_at: string; reason: string | null; is_active: boolean };
export function validateExceptionInput(input: { type: string; startDate: string; startTime: string; endDate: string; endTime: string; allDay: boolean; reason: string }) {
  if (!input.startDate || !input.endDate) return "Indica las fechas de inicio y fin.";
  if (input.reason.length > 300) return "El motivo no puede superar 300 caracteres.";
  if (!input.allDay && (!input.startTime || !input.endTime)) return "Indica las horas o activa Todo el día.";
  if (input.endDate < input.startDate || (!input.allDay && input.endDate === input.startDate && input.endTime <= input.startTime)) return "El inicio debe ser anterior al final.";
  if (!["available", "unavailable"].includes(input.type)) return "Tipo de excepción inválido.";
  return null;
}
