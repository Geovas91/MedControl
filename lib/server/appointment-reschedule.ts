import "server-only";

import { appointmentTimestampToLocalParts } from "@/lib/appointments/edit";
import { calculateAppointmentDuration } from "@/lib/appointments/format";
import { appointmentDurations } from "@/lib/appointments/create";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getProfessionalAvailableSlots, type ProfessionalSlot } from "@/lib/server/professional-slots";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type AppointmentRescheduleData = {
  appointment: { id: string; doctor_id: string; status: string; starts_at: string; ends_at: string; updated_at: string };
  localDate: string;
  localTime: string;
  duration: number;
  timeZone: string;
  slots: ProfessionalSlot[];
};

export type AppointmentRescheduleResult =
  | { state: "ready"; data: AppointmentRescheduleData }
  | { state: "invalid_id" | "unauthenticated" | "no_active_membership" | "forbidden" | "not_found" | "error"; data?: null };

export async function getAppointmentRescheduleForActiveTenant(
  appointmentId: string,
  requestedDate?: string
): Promise<AppointmentRescheduleResult> {
  if (!isCanonicalAppointmentUuid(appointmentId)) return { state: "invalid_id", data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  const clinicId = context.tenant.clinic.id;
  const role = context.tenant.membership.role;
  if (!(["owner", "admin", "doctor", "assistant"] as string[]).includes(role)) return { state: "forbidden", data: null };
  const supabase = await createClient();
  const result = await supabase.from("appointments")
    .select("id, doctor_id, status, starts_at, ends_at, updated_at")
    .eq("id", appointmentId).eq("clinic_id", clinicId).maybeSingle();
  if (result.error) {
    logger.error("Appointment reschedule context query failed", { component: "appointment_reschedule", status: "context_query_error", code: result.error.code });
    return { state: "error", data: null };
  }
  const appointment = result.data as unknown as AppointmentRescheduleData["appointment"] | null;
  if (!appointment || !appointment.doctor_id) return { state: "not_found", data: null };
  if (role === "doctor" && appointment.doctor_id !== context.user.id) return { state: "forbidden", data: null };
  const memberResult = await supabase.from("clinic_members").select("id").eq("clinic_id", clinicId).eq("user_id", appointment.doctor_id).eq("status", "active").maybeSingle();
  if (memberResult.error || !memberResult.data) return { state: "error", data: null };
  const duration = calculateAppointmentDuration(appointment.starts_at, appointment.ends_at);
  const current = appointmentTimestampToLocalParts(appointment.starts_at, context.tenant.clinic.timezone);
  if (!duration || !appointmentDurations.includes(duration as (typeof appointmentDurations)[number]) || !current) return { state: "error", data: null };
  const localDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : current.date;
  const clinicMember = memberResult.data as unknown as { id: string };
  const slotsResult = await getProfessionalAvailableSlots({ clinicMemberId: clinicMember.id, localDate, durationMinutes: duration, slotIntervalMinutes: 15 });
  if (slotsResult.state !== "ready") return { state: "error", data: null };
  const slots = [...slotsResult.data];
  if (localDate === current.date && !slots.some((slot) => slot.local_start === current.time)) {
    slots.push({ start_at: appointment.starts_at, end_at: appointment.ends_at, local_start: current.time, local_end: appointmentTimestampToLocalParts(appointment.ends_at, context.tenant.clinic.timezone)?.time ?? current.time });
    slots.sort((a, b) => a.start_at.localeCompare(b.start_at));
  }
  return { state: "ready", data: { appointment, localDate, localTime: localDate === current.date ? current.time : (slots[0]?.local_start ?? "09:00"), duration, timeZone: context.tenant.clinic.timezone, slots } };
}
