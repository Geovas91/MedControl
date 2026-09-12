"use client";

import Link from "next/link";
import { useActionState } from "react";
import { askSupportAssistantAction, createSupportTicketAction, runSupportDiagnosticAction, type SupportAssistantActionState, type SupportDiagnosticActionState, type SupportFormActionState } from "@/app/dashboard/support/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { diagnosticLabels, diagnosticStatusLabels, supportCategoryLabels, supportIntentMessages } from "@/lib/support/presentation";
import { supportDiagnosticIds } from "@/lib/support/types";

const assistantInitial: SupportAssistantActionState = { status: "idle" };
const diagnosticInitial: SupportDiagnosticActionState = { status: "idle" };
const formInitial: SupportFormActionState = { status: "idle" };

function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return <Button type="submit" disabled={disabled}>{children}</Button>;
}

export function SupportAssistantForm() {
  const [state, action, pending] = useActionState(askSupportAssistantAction, assistantInitial);
  return <div className="grid gap-4"><form action={action} className="grid gap-3">
    <Field label="Describe el problema técnico" htmlFor="support-question"><Textarea id="support-question" name="question" required maxLength={300} placeholder="¿En qué necesitas ayuda?" /></Field>
    <p className="text-xs text-[var(--foreground-muted)]">No incluyas nombres de pacientes, diagnósticos ni datos clínicos.</p>
    <SubmitButton disabled={pending}>{pending ? "Revisando…" : "Obtener ayuda guiada"}</SubmitButton>
  </form>
  {state.message ? <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">{state.message}</p> : null}
  {state.answer ? <section aria-live="polite" className="glass-card p-4">
    <h3 className="font-bold text-ink">Respuesta guiada</h3><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-clinic">Estado: {state.answer.status === "unresolved" ? "No resuelto" : "Respuesta verificada"}</p><p className="mt-2 text-sm leading-6 text-[var(--foreground-soft)]">{supportIntentMessages[state.answer.intent]}</p>
    {state.answer.articleReferences.length ? <div className="mt-3"><p className="text-sm font-semibold text-ink">Artículos sugeridos</p><ul className="mt-2 grid gap-2">{state.answer.articleReferences.map((article) => <li key={article.slug}><Link href={`/dashboard/support/articles/${article.slug}`} className="text-sm font-semibold text-clinic hover:underline">{article.title}</Link></li>)}</ul></div> : null}
    {state.answer.diagnostics.map((diagnostic) => <div key={diagnostic.diagnosticId} className="clinical-surface mt-3 p-3 text-sm"><strong>{diagnosticLabels[diagnostic.diagnosticId]}:</strong> {diagnosticStatusLabels[diagnostic.status]}<span className="block text-xs text-[var(--foreground-muted)]">Verificado: {new Date(diagnostic.verifiedAt).toLocaleString("es-MX")}</span></div>)}
    {state.answer.offerTicket ? <a href="#crear-ticket" className="mt-4 inline-flex text-sm font-semibold text-clinic hover:underline">Crear ticket de soporte</a> : null}
  </section> : null}</div>;
}

export function SupportDiagnosticForm() {
  const [state, action, pending] = useActionState(runSupportDiagnosticAction, diagnosticInitial);
  return <div className="grid gap-4"><form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <Field label="Comprobación segura" htmlFor="diagnostic-id"><Select id="diagnostic-id" name="diagnostic_id" required>{supportDiagnosticIds.map((id) => <option key={id} value={id}>{diagnosticLabels[id]}</option>)}</Select></Field>
    <SubmitButton disabled={pending}>{pending ? "Verificando…" : "Ejecutar diagnóstico"}</SubmitButton>
  </form>
  {state.message ? <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">{state.message}</p> : null}
  {state.diagnostic ? <div aria-live="polite" className="clinical-surface p-4"><p className="font-semibold text-ink">{diagnosticLabels[state.diagnostic.diagnosticId]}</p><p className="mt-1 text-sm">Estado: {diagnosticStatusLabels[state.diagnostic.status]}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Verificado: {new Date(state.diagnostic.verifiedAt).toLocaleString("es-MX")}</p></div> : null}</div>;
}

export function CreateSupportTicketForm() {
  const [state, action, pending] = useActionState(createSupportTicketAction, formInitial);
  return <form action={action} className="grid gap-4">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Categoría" htmlFor="ticket-category"><Select id="ticket-category" name="category" required>{Object.entries(supportCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
    <Field label="Impacto" htmlFor="ticket-impact"><Select id="ticket-impact" name="impact" required><option value="informational">Necesito información</option><option value="single_user_blocked">Una persona no puede continuar</option><option value="multiple_users_blocked">Varias personas no pueden continuar</option><option value="access_blocked">No puedo acceder</option></Select></Field></div>
    <Field label="Asunto" htmlFor="ticket-subject"><Input id="ticket-subject" name="subject" required maxLength={140} /></Field>
    <Field label="Resumen" htmlFor="ticket-summary"><Textarea id="ticket-summary" name="summary" required maxLength={2000} /></Field>
    <p className="rounded-[var(--radius-sm)] bg-[var(--warning-soft)] p-3 text-sm font-medium text-[var(--warning)]">No incluyas nombres de pacientes, diagnósticos, resultados ni otra información clínica.</p>
    {state.message ? <p role="status" className="text-sm text-[var(--danger)]">{state.message}</p> : null}
    <SubmitButton disabled={pending}>{pending ? "Creando…" : "Crear ticket"}</SubmitButton>
  </form>;
}
