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

type AppointmentDeliveryClient = {
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
  if (context.state !== "ready" || !["owner", "doctor", "admin"].includes(context.tenant.membership.role)) {
    return "failed";
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const appointmentResult = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, starts_at, ends_at, status, location, meeting_url, updated_at")
    .eq("id", input.appointmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (appointmentResult.error || !appointmentResult.data) return "failed";
  const appointment = appointmentResult.data as {
    id: string;
    patient_id: string;
    doctor_id: string | null;
    starts_at: string;
    ends_at: string;
    status: string;
    location: string | null;
    meeting_url: string | null;
    updated_at: string;
  };

  if (!isCurrentAppointmentVersion(appointment.updated_at, input.appointmentVersion)) return "duplicate";
  if ((input.method === "CANCEL") !== (appointment.status === "cancelled")) return "failed";

  const [patientResult, clinicResult, doctorResult] = await Promise.all([
    supabase.from("patients").select("email").eq("id", appointment.patient_id).eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("clinics").select("email").eq("id", clinicId).maybeSingle(),
    appointment.doctor_id
      ? supabase
          .from("doctor_public_profiles")
          .select("display_name")
          .eq("profile_id", appointment.doctor_id)
          .eq("clinic_id", clinicId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (patientResult.error || clinicResult.error || doctorResult.error) return "failed";
  const patientData = patientResult.data as { email: string | null } | null;
  const clinicData = clinicResult.data as { email: string | null } | null;
  const doctorData = doctorResult.data as { display_name: string } | null;

  const patientEmail = typeof patientData?.email === "string" ? patientData.email.trim().toLowerCase() : "";
  const configuration = getInvitationEmailConfiguration();
  const preflight = getCalendarDeliveryPreflight({
    recipientValid: compatibleEmail.test(patientEmail),
    providerReady: configuration.state === "ready"
  });
  if (preflight !== "ready") return preflight;
  if (configuration.state !== "ready") return "disabled";

  const clinicEmail = typeof clinicData?.email === "string" ? clinicData.email.trim() : "";
  const organizerEmail = (compatibleEmail.test(clinicEmail) ? clinicEmail : null)
    ?? configuration.replyTo
    ?? extractFromEmail(configuration.from);
  if (!organizerEmail) return "failed";

  const doctorName = typeof doctorData?.display_name === "string" ? doctorData.display_name : null;
  const template = buildAppointmentInvitationEmail({
    kind: mapKind(input.method, input.reason),
    clinicName: context.tenant.clinic.name,
    doctorName,
    startsAt: appointment.starts_at,
    timeZone: context.tenant.clinic.timezone,
    location: appointment.location,
    meetingUrl: appointment.meeting_url
  });

  const prepare = await (supabase as unknown as AppointmentDeliveryClient).rpc("prepare_appointment_email_invite", {
    p_appointment_id: appointment.id,
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
    }
  }

  const ics = generateAppointmentIcs({
    method: input.method,
    uid: invite.icsUid,
    sequence: invite.sequence,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    clinicName: context.tenant.clinic.name,
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
    idempotencyKey: `appointment-${appointment.id}-${invite.sequence}-${input.method.toLowerCase()}`
  });

  if (result.ok) {
    await persistOutcome("sent", result.messageId);
    return "sent";
  }

  const outcome = getInvitationDeliveryStatus(result);
  const safeOutcome = outcome === "delivery_unknown" ? "delivery_unknown" : "failed";
  await persistOutcome(safeOutcome, undefined, result.code);
  return safeOutcome;
}
