"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { parseAppointmentStatusFormData } from "@/lib/appointments/status";
import { updateAppointmentStatusForActiveTenant } from "@/lib/server/update-appointment-status";
import { deliverAppointmentCalendarEmail } from "@/lib/server/appointment-calendar-email";
import { getStatusCalendarOperation } from "@/lib/calendar/invitation";
import { syncAppointmentGoogleCalendar } from "@/lib/server/appointment-google-calendar";
import { deliverReviewInvitationEmail, issueReviewInvitation, revokeReviewInvitation } from "@/lib/server/review-invitations";

export type AppointmentStatusActionState = {
  error?: string;
};

export type ReviewInvitationActionState = { error?: string; url?: string; expiresAt?: string; message?: string; status?: "pending" | "sent" | "revoked" };

export async function issueReviewInvitationAction(appointmentId: string, _state: ReviewInvitationActionState): Promise<ReviewInvitationActionState> {
  const result = await issueReviewInvitation(appointmentId);
  if (result.state !== "created") return { error: result.state === "forbidden" ? "Tu rol o suscripción no permiten solicitar esta reseña." : "No fue posible generar la invitación. Verifica que la cita esté completada y tenga un perfil profesional válido." };
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  return { url: result.reviewUrl, expiresAt: result.expiresAt, status: "pending", message: "Enlace generado. Sólo estará disponible en esta sesión." };
}

export async function revokeReviewInvitationAction(appointmentId: string, _state: ReviewInvitationActionState): Promise<ReviewInvitationActionState> {
  const result = await revokeReviewInvitation(appointmentId);
  if (result.state !== "revoked") return { error: result.state === "forbidden" ? "Tu rol o suscripción no permiten revocar esta invitación." : "La invitación no está activa." };
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  return { status: "revoked", message: "Invitación revocada." };
}

export async function sendReviewInvitationEmailAction(appointmentId: string, _state: ReviewInvitationActionState, formData: FormData): Promise<ReviewInvitationActionState> {
  const reviewUrl = typeof formData.get("review_url") === "string" ? String(formData.get("review_url")) : "";
  const result = await deliverReviewInvitationEmail({ appointmentId, reviewUrl });
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  if (result.state !== "sent") {
    const message = result.state === "missing_recipient" ? "El paciente no tiene correo registrado." : result.state === "provider_unavailable" ? "El servicio de correo no está configurado." : "No fue posible enviar el correo. El enlace sigue disponible para copiar.";
    return { error: message };
  }
  return { status: "sent", message: "Solicitud enviada por correo." };
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  _previousState: AppointmentStatusActionState,
  formData: FormData
): Promise<AppointmentStatusActionState> {
  const input = parseAppointmentStatusFormData(formData);

  if (!input) return { error: "El estado solicitado no es válido." };

  const result = await updateAppointmentStatusForActiveTenant(appointmentId, input);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state === "forbidden") return { error: "Tu rol actual no permite gestionar estados de citas." };

  if (result.state !== "success") return { error: result.error };

  const calendarOperation = getStatusCalendarOperation(result.outcome);
  const [calendarEmail] = calendarOperation
    ? await Promise.all([
        deliverAppointmentCalendarEmail({
          appointmentId,
          ...calendarOperation,
          operationKey: result.operationKey,
          appointmentVersion: result.appointmentVersion
        }),
        syncAppointmentGoogleCalendar({
          appointmentId,
          appointmentVersion: result.appointmentVersion,
          operation: calendarOperation.method === "CANCEL" ? "delete" : "upsert"
        })
      ])
    : [null];

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  revalidatePath(`/dashboard/patients/${result.patientId}`);

  if (result.localDate) {
    revalidatePath(`/dashboard/appointments?date=${encodeURIComponent(result.localDate)}`);
  }

  const query = new URLSearchParams({ status_updated: result.outcome });
  if (calendarEmail) query.set("calendar_email", calendarEmail);
  redirect(`/dashboard/appointments/${appointmentId}?${query.toString()}`);
}
