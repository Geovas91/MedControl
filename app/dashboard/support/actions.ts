"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { answerSupportQuestion } from "@/lib/server/support/assistant";
import { runSupportDiagnostic } from "@/lib/server/support/diagnostics";
import { hasValidSupportMutationOrigin } from "@/lib/server/support/origin";
import { addSupportTicketMessage, createSupportTicket, transitionOwnSupportTicket } from "@/lib/server/support/tickets";
import type { SafeDiagnosticResult, SupportAnswer } from "@/lib/support/types";

export type SupportAssistantActionState = { status: "idle" | "success" | "error" | "rate_limited"; message?: string; answer?: SupportAnswer };
export type SupportDiagnosticActionState = { status: "idle" | "success" | "error" | "rate_limited"; message?: string; diagnostic?: SafeDiagnosticResult };
export type SupportFormActionState = { status: "idle" | "error" | "rate_limited"; message?: string };

const unsafeRequest = { status: "error", message: "No fue posible validar la solicitud. Recarga la página e intenta de nuevo." } as const;

export async function askSupportAssistantAction(_previous: SupportAssistantActionState, formData: FormData): Promise<SupportAssistantActionState> {
  if (!(await hasValidSupportMutationOrigin())) return unsafeRequest;
  const result = await answerSupportQuestion(String(formData.get("question") ?? ""));
  if (result.state === "rate_limited") return { status: "rate_limited", message: "Alcanzaste temporalmente el límite de diagnósticos. Intenta más tarde." };
  if (result.state !== "ready") return { status: "error", message: result.state === "invalid_input" ? "Describe el problema en 300 caracteres o menos." : "La ayuda guiada no está disponible temporalmente." };
  return { status: "success", answer: result.data };
}
export async function runSupportDiagnosticAction(_previous: SupportDiagnosticActionState, formData: FormData): Promise<SupportDiagnosticActionState> {
  if (!(await hasValidSupportMutationOrigin())) return unsafeRequest;
  const result = await runSupportDiagnostic(String(formData.get("diagnostic_id") ?? ""));
  if (result.state === "rate_limited") return { status: "rate_limited", message: "Alcanzaste temporalmente el límite de diagnósticos. Intenta más tarde." };
  if (result.state !== "ready") return { status: "error", message: result.state === "invalid_diagnostic" ? "El diagnóstico seleccionado no está permitido." : "El diagnóstico no está disponible temporalmente." };
  return { status: "success", diagnostic: result.data };
}

export async function createSupportTicketAction(_previous: SupportFormActionState, formData: FormData): Promise<SupportFormActionState> {
  if (!(await hasValidSupportMutationOrigin())) return unsafeRequest;
  const result = await createSupportTicket({
    category: String(formData.get("category") ?? ""), impact: String(formData.get("impact") ?? ""),
    subject: String(formData.get("subject") ?? ""), summary: String(formData.get("summary") ?? "")
  });
  if (result.state === "rate_limited") return { status: "rate_limited", message: "Alcanzaste el límite de creación de tickets. Intenta más tarde." };
  if (result.state !== "ready") return { status: "error", message: result.state === "invalid_input" ? "Revisa la categoría, el impacto y los límites de texto." : "No fue posible crear el ticket." };
  revalidatePath("/dashboard/support");
  redirect(`/dashboard/support/tickets/${result.data.id}?created=1`);
}

export async function addSupportTicketMessageAction(ticketId: string, _previous: SupportFormActionState, formData: FormData): Promise<SupportFormActionState> {
  if (!(await hasValidSupportMutationOrigin())) return unsafeRequest;
  const result = await addSupportTicketMessage(ticketId, String(formData.get("message") ?? ""));
  if (result.state === "rate_limited") return { status: "rate_limited", message: "Alcanzaste el límite de respuestas. Intenta más tarde." };
  if (result.state !== "ready") return { status: "error", message: result.state === "invalid_input" ? "La respuesta debe tener entre 1 y 4,000 caracteres." : "No fue posible agregar la respuesta." };
  revalidatePath(`/dashboard/support/tickets/${ticketId}`);
  redirect(`/dashboard/support/tickets/${ticketId}?message=added`);
}

export async function closeSupportTicketAction(ticketId: string, fromStatus: string, _previous: SupportFormActionState): Promise<SupportFormActionState> {
  if (!(await hasValidSupportMutationOrigin())) return unsafeRequest;
  const result = await transitionOwnSupportTicket(ticketId, fromStatus, "closed");
  if (result.state !== "ready") return { status: "error", message: "El ticket no puede cerrarse desde su estado actual." };
  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/support/tickets/${ticketId}`);
  redirect(`/dashboard/support/tickets/${ticketId}?closed=1`);
}
