import "server-only";

import { generateAppointmentIcs, type AppointmentIcsMethod } from "@/lib/calendar/ics";
import { getCalendarDeliveryPreflight, isCurrentAppointmentVersion } from "@/lib/calendar/invitation";
import { getInvitationDeliveryStatus } from "@/lib/email/delivery-status";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import {
  buildAppointmentInvitationEmail,
  type AppointmentEmailKind
} from "@/lib/email/templates/appointment-invitation";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";

export type AppointmentCalendarDeliveryOutcome =
  | "sent"
  | "missing_recipient"
  | "failed"
  | "delivery_unknown"
  | "disabled"
  | "duplicate";

type PrepareResult = {
  invite_id: string | null;
  ics_uid: string | null;
  sequence: number;
  should_send: boolean;
  version_matches: boolean;
};

type CalendarEmailContext = {
  appointment_id: string; patient_email: string | null; starts_at: string; ends_at: string;
  status: string; location: string | null; meeting_url: string | null; doctor_name: string | null;
  clinic_name: string; clinic_email: string | null; clinic_timezone: string; updated_at: string;
};

type AppointmentDeliveryClient = {
  rpc(fn: "get_appointment_calendar_email_context_for_current_user", args: { p_appointment_id: string }): Promise<{ data: CalendarEmailContext[] | null; error: { code?: string } | null }>;
  rpc(
    fn: "prepare_appointment_email_invite",
    args: { p_appointment_id: string; p_method: AppointmentIcsMethod; p_idempotency_key: string; p_appointment_version: string }
  ): Promise<{ data: PrepareResult[] | null; error: { code?: string } | null }>;
  rpc(
    fn: "record_appointment_email_invite_result",
    args: {
      p_invite_id: string;
      p_sequence: number;
      p_idempotency_key: string;
      p_outcome: "sent" | "failed" | "delivery_unknown";
      p_provider_message_id: string | null;
      p_error_code: string | null;
    }
  ): Promise<{ data: boolean | null; error: { code?: string } | null }>;
};

const compatibleEmail = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

function extractFromEmail(value: string) {
  const angle = /<([^<>\s]+@[^<>\s]+)>$/.exec(value)?.[1];
  const email = angle ?? value.trim();
  return compatibleEmail.test(email) ? email : null;
}

function mapKind(method: AppointmentIcsMethod, reason: "created" | "rescheduled" | "cancelled" | "restored"): AppointmentEmailKind {
  if (method === "CANCEL" || reason === "cancelled") return "cancelled";
  if (reason === "rescheduled") return "rescheduled";
  if (reason === "restored") return "restored";
  return "confirmation";
}

type DeliveryInput = {
  appointmentId: string;
  method: AppointmentIcsMethod;
  reason: "created" | "rescheduled" | "cancelled" | "restored";
  operationKey: string;
  appointmentVersion: string;
};

export async function deliverAppointmentCalendarEmail(input: DeliveryInput): Promise<AppointmentCalendarDeliveryOutcome> {
  try {
    return await deliverAppointmentCalendarEmailInternal(input);
  } catch {
    logger.error("Appointment calendar email failed without affecting the appointment", {
      component: "appointment_calendar_email",
      status: "unhandled_delivery_error"
    });
    return "failed";
  }
}

async function deliverAppointmentCalendarEmailInternal(input: DeliveryInput): Promise<AppointmentCalendarDeliveryOutcome> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return "failed";
  const supabase = await createClient();
  const lookup = await (supabase as unknown as AppointmentDeliveryClient).rpc(
    "get_appointment_calendar_email_context_for_current_user", { p_appointment_id: input.appointmentId }
  );
  const appointment = lookup.data?.[0];
  if (lookup.error || !appointment) return "failed";
  if (!isCurrentAppointmentVersion(appointment.updated_at, input.appointmentVersion)) return "duplicate";
  if ((input.method === "CANCEL") !== (appointment.status === "cancelled")) return "failed";
  const patientEmail = appointment.patient_email?.trim().toLowerCase() ?? "";
  const configuration = getInvitationEmailConfiguration();
  const preflight = getCalendarDeliveryPreflight({
    recipientValid: compatibleEmail.test(patientEmail),
    providerReady: configuration.state === "ready"
  });
  if (preflight !== "ready") return preflight;
  if (configuration.state !== "ready") return "disabled";

  const clinicEmail = appointment.clinic_email?.trim() ?? "";
  const organizerEmail = (compatibleEmail.test(clinicEmail) ? clinicEmail : null)
    ?? configuration.replyTo
    ?? extractFromEmail(configuration.from);
  if (!organizerEmail) return "failed";

  const doctorName = appointment.doctor_name;
  const template = buildAppointmentInvitationEmail({
    kind: mapKind(input.method, input.reason),
    clinicName: appointment.clinic_name,
    doctorName,
    startsAt: appointment.starts_at,
    timeZone: appointment.clinic_timezone,
    location: appointment.location,
    meetingUrl: appointment.meeting_url
  });

  const prepare = await (supabase as unknown as AppointmentDeliveryClient).rpc("prepare_appointment_email_invite", {
    p_appointment_id: appointment.appointment_id,
    p_method: input.method,
    p_idempotency_key: input.operationKey,
    p_appointment_version: input.appointmentVersion
  });
  const prepared = prepare.data?.[0];

  if (prepare.error || !prepared) {
    logger.error("Appointment calendar invite preparation failed", {
      component: "appointment_calendar_email",
      status: "prepare_error",
      code: prepare.error?.code
    });
    return "failed";
  }
  if (!prepared.version_matches) return "duplicate";
  if (!prepared.should_send) return "duplicate";
  if (!prepared.invite_id || !prepared.ics_uid) return "failed";
  const invite = {
    inviteId: prepared.invite_id,
    icsUid: prepared.ics_uid,
    sequence: prepared.sequence
  };

  async function persistOutcome(outcome: "sent" | "failed" | "delivery_unknown", messageId?: string, errorCode?: string) {
    try {
      const persistence = await (supabase as unknown as AppointmentDeliveryClient).rpc(
        "record_appointment_email_invite_result",
        {
          p_invite_id: invite.inviteId,
          p_sequence: invite.sequence,
          p_idempotency_key: input.operationKey,
          p_outcome: outcome,
          p_provider_message_id: messageId ?? null,
          p_error_code: errorCode ?? null
        }
      );

      if (persistence.error || !persistence.data) {
        logger.error("Appointment calendar invite result persistence failed", {
          component: "appointment_calendar_email",
          status: "persistence_error",
          code: persistence.error?.code
        });
        return false;
      }
      return true;
    } catch {
      logger.error("Appointment calendar invite result persistence failed", { component: "appointment_calendar_email", status: "persistence_error" });
      return false;
    }
  }

  const ics = generateAppointmentIcs({
    method: input.method,
    uid: invite.icsUid,
    sequence: invite.sequence,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    clinicName: appointment.clinic_name,
    doctorName,
    organizerEmail,
    attendeeEmail: patientEmail,
    location: appointment.location,
    meetingUrl: appointment.meeting_url
  });
  const result = await sendWithResend(configuration, {
    to: patientEmail,
    ...template,
    replyTo: configuration.replyTo,
    attachments: [{
      content: ics,
      filename: input.method === "CANCEL" ? "cancelacion-cita.ics" : "cita.ics",
      contentType: `text/calendar; charset=utf-8; method=${input.method}`
    }],
    idempotencyKey: `appointment-${appointment.appointment_id}-${invite.sequence}-${input.method.toLowerCase()}`
  });

  if (result.ok) {
    const persisted = await persistOutcome("sent", result.messageId);
    return persisted ? "sent" : "delivery_unknown";
  }

  const outcome = getInvitationDeliveryStatus(result);
  const safeOutcome = outcome === "delivery_unknown" ? "delivery_unknown" : "failed";
  const persisted = await persistOutcome(safeOutcome, undefined, result.code);
  return persisted ? safeOutcome : "delivery_unknown";
}
