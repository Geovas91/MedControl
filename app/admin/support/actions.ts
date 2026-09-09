"use server";

import { revalidatePath } from "next/cache";
import { sendSupportNotification } from "@/lib/email/support-notifications";
import { addAdminSupportMessage, assignAdminSupportTicket, transitionAdminSupportTicket } from "@/lib/server/support/admin";
import { hasValidSupportMutationOrigin } from "@/lib/server/support/origin";
import { createAdminClient } from "@/lib/supabase/admin";

const unsafe = { state: "error" as const };

async function requesterEmail(userId: string) {
  const profile = await createAdminClient().from("profiles").select("email").eq("id", userId).maybeSingle();
  return profile.data?.email;
}

export async function transitionSupportAction(id: string, expectedStatus: string, status: string) {
  if (!(await hasValidSupportMutationOrigin())) return unsafe;
  const result = await transitionAdminSupportTicket(id, expectedStatus, status);
  if (result.state === "ready") {
    void sendSupportNotification({
      type: "ticket_status_changed_requester",
      ticketId: id,
      eventId: result.data.eventId,
      reference: result.data.reference,
      status: result.data.status,
      requesterEmail: await requesterEmail(result.data.createdBy)
    });
  }
  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/support/tickets/${id}`);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/tickets/${id}`);
  return result;
}

export async function assignSupportAction(id: string, adminId: string | null) {
  if (!(await hasValidSupportMutationOrigin())) return unsafe;
  const result = await assignAdminSupportTicket(id, adminId);
  revalidatePath(`/admin/support/tickets/${id}`);
  return result;
}

export async function replySupportAction(id: string, body: string, internal = false) {
  if (!(await hasValidSupportMutationOrigin())) return unsafe;
  const result = await addAdminSupportMessage(id, body, internal);
  if (result.state === "ready" && !internal) {
    void sendSupportNotification({
      type: "ticket_replied_requester",
      ticketId: id,
      eventId: result.data.messageId,
      reference: result.data.reference,
      status: result.data.status,
      requesterEmail: await requesterEmail(result.data.createdBy)
    });
  }
  revalidatePath(`/admin/support/tickets/${id}`);
  return result;
}
