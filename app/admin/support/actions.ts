"use server";
import { revalidatePath } from "next/cache";
import { hasValidSupportMutationOrigin } from "@/lib/server/support/origin";
import { addAdminSupportMessage, assignAdminSupportTicket, transitionAdminSupportTicket } from "@/lib/server/support/admin";
import { getAdminSupportTicket } from "@/lib/server/support/admin";
import { sendSupportNotification } from "@/lib/email/support-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
const unsafe={state:"error" as const};
export async function transitionSupportAction(id:string,status:string){if(!(await hasValidSupportMutationOrigin()))return unsafe;const r=await transitionAdminSupportTicket(id,status);if(r.state==="ready"){const d=await getAdminSupportTicket(id);if(d.state==="ready"){const p=await createAdminClient().from("profiles").select("email").eq("id",d.data.ticket.created_by).maybeSingle();void sendSupportNotification({type:"ticket_status_changed_requester",ticketId:id,reference:d.data.ticket.reference_code,status,requesterEmail:p.data?.email});}}revalidatePath("/dashboard/support");revalidatePath(`/dashboard/support/tickets/${id}`);revalidatePath("/admin/support");revalidatePath(`/admin/support/tickets/${id}`);return r;}
export async function assignSupportAction(id:string,adminId:string|null){if(!(await hasValidSupportMutationOrigin()))return unsafe;const r=await assignAdminSupportTicket(id,adminId);revalidatePath(`/admin/support/tickets/${id}`);return r;}
export async function replySupportAction(id:string,body:string,internal=false){if(!(await hasValidSupportMutationOrigin()))return unsafe;const r=await addAdminSupportMessage(id,body,internal);if(r.state==="ready"&&!internal){const d=await getAdminSupportTicket(id);if(d.state==="ready"){const p=await createAdminClient().from("profiles").select("email").eq("id",d.data.ticket.created_by).maybeSingle();void sendSupportNotification({type:"ticket_replied_requester",ticketId:id,reference:d.data.ticket.reference_code,status:d.data.ticket.status,requesterEmail:p.data?.email});}}revalidatePath(`/admin/support/tickets/${id}`);return r;}
