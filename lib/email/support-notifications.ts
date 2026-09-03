import "server-only";
import { getInvitationEmailConfiguration } from "@/lib/email/config";
import { sendWithResend } from "@/lib/email/resend-provider";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { logger } from "@/lib/logger";

export type SupportNotificationType = "ticket_created_support"|"ticket_created_requester"|"ticket_replied_requester"|"ticket_status_changed_requester";
export function resolveSupportRecipient(type: SupportNotificationType, supportEmail: string|undefined, requesterEmail: string|null|undefined){
  const value=(type==="ticket_created_support"?supportEmail:requesterEmail)?.trim();
  return value && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : null;
}
export function buildSupportNotificationMessage(input:{type:SupportNotificationType; ticketId:string; reference:string; status:string; category?:string; severity?:string}, baseUrl:string){
  const path=input.type==="ticket_created_support"?`/admin/support/tickets/${input.ticketId}`:`/dashboard/support/tickets/${input.ticketId}`;
  const url=new URL(path,baseUrl).toString();
  const subject=input.type==="ticket_created_support"?`[Nuevo ticket] ${input.reference}`:`Seguimiento de tu solicitud ${input.reference}`;
  const text=input.type==="ticket_created_support"?`Se creó un nuevo ticket de soporte en CliniControl.\n\nReferencia: ${input.reference}\nCategoría: ${input.category??"Soporte"}\nSeveridad: ${input.severity??"Normal"}\nEstado: ${input.status}\n\nRevisar en CliniControl: ${url}`:`Tu solicitud de soporte ${input.reference} tiene estado ${input.status}.\n\nPuedes revisar el seguimiento en CliniControl: ${url}`;
  return { subject, text, html:text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\n","<br />"), url };
}
export async function sendSupportNotification(input:{type:SupportNotificationType; ticketId:string; reference:string; status:string; category?:string; severity?:string; requesterEmail?:string|null}) {
  const to=resolveSupportRecipient(input.type,process.env.SUPPORT_EMAIL_TO,input.requesterEmail);
  if(!to) return {state:"skipped" as const,reason:"no_recipient"};
  const config=getInvitationEmailConfiguration(); if(config.state!=="ready") return {state:"skipped" as const,reason:"provider_unavailable"};
  const message=buildSupportNotificationMessage(input,getAppBaseUrl());
  const result=await sendWithResend(config,{to,subject:message.subject,text:message.text,html:message.html,idempotencyKey:`support-${input.type}-${input.ticketId}-${input.status}`});
  if(!result.ok){logger.error("Support notification failed",{component:"support_notifications",operation:"send",status:"failed",code:result.code}); return {state:"failed" as const,reason:result.code};}
  logger.info("Support notification sent",{component:"support_notifications",operation:"send",status:"sent",code:input.type}); return {state:"sent" as const};
}
