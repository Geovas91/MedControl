"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarClock, Check, Clock3, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appointmentStatuses, getAppointmentStatusLabel, type AppointmentStatus } from "@/lib/appointments/query";
import {
  cancelAssistantProposalAction,
  confirmAssistantProposalAction,
  planAssistantConversationAction,
  submitAssistantIntentAction,
  selectAssistantResultAction,
  submitAssistantContextualHelperAction,
  type AssistantUiResponse
} from "@/app/dashboard/bot/actions";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import type { AssistantStructuredChoice } from "@/lib/assistant/orchestration/structured-selection";
import { classifyContextualHelper, resolveConversationInput } from "@/lib/assistant/orchestration/conversation";

type Message = { id: number; author: "user" | "assistant"; text: string; response?: AssistantUiResponse };
type Props = { today: string; timeZone: string; llmEnabled: boolean };
const SAFE_SUBMIT_ERROR = "No fue posible procesar la solicitud. Intenta de nuevo.";
const ASSISTANT_PENDING_LABEL = "El asistente está procesando la solicitud.";

function formatDate(value: string, timeZone: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone }).format(parsed);
}

function formatInstant(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function statusLabel(value: string) {
  return appointmentStatuses.includes(value as AppointmentStatus) ? getAppointmentStatusLabel(value as AppointmentStatus) : "Estado no disponible";
}

function ReadResult({ response, timeZone }: { response?: AssistantUiResponse; timeZone: string }) {
  if (response?.state === "appointment") return <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-slate-700">{response.appointment.patient} · {response.appointment.professional ?? "Profesional"} · {formatInstant(response.appointment.startsAt, timeZone)} · {statusLabel(response.appointment.status)}</div>;
  return null;
}

function responseText(response: AssistantUiResponse) {
  if (response.state === "proposal_terminal") return response.message;
  if ("message" in response) return response.message;
  const more = "hasMore" in response && response.hasMore ? " Hay más resultados; refina la búsqueda." : "";
  if (response.state === "slots") return `Encontré ${response.slots.length} horarios disponibles.${more}`;
  if (response.state === "patients") return `Encontré ${response.patients.length} pacientes.${more}`;
  if (response.state === "professionals") return `Encontré ${response.professionals.length} profesionales para agendar.${more}`;
  if (response.state === "appointments") return `Encontré ${response.appointments.length} citas.${more}`;
  if (response.state === "appointment") return "Encontré la cita solicitada.";
  if (response.state === "proposal") return "Preparé una propuesta para que la revises.";
  return "";
}

export function AppointmentAssistant({ today, timeZone, llmEnabled }: Props) {
  const [messages, setMessages] = useState<Message[]>([{ id: 1, author: "assistant", text: "Hola, ¿qué quieres hacer con tu agenda?" }]);
  const [value, setValue] = useState("");
  const [pendingIntent, setPendingIntent] = useState<AssistantIntent | null>(null);
  const [proposal, setProposal] = useState<Extract<AssistantUiResponse, { state: "proposal" }> | null>(null);
  const [isPending, startTransition] = useTransition();
  const nextId = useRef(2);
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreInputFocus = useRef(false);

  const append = (message: Omit<Message, "id">) => {
    const id = nextId.current++;
    setMessages((current) => [...current, { ...message, id }]);
  };

  const applyResponse = (response: AssistantUiResponse, fallbackIntent: AssistantIntent | null) => {
    if (response.state === "proposal") { setProposal(response); setPendingIntent(null); }
    else if (response.state === "choices") setPendingIntent(fallbackIntent);
    else if (response.state === "availability_retry") setPendingIntent(response.intent);
    else if (response.state === "message") setPendingIntent(response.intent ?? fallbackIntent);
    else setPendingIntent(null);
  };

  const runPending = (operation: () => Promise<void>) => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    restoreInputFocus.current = typeof document !== "undefined" && document.activeElement === inputRef.current;
    startTransition(async () => {
      try {
        await operation();
      } catch {
        append({ author: "assistant", text: SAFE_SUBMIT_ERROR });
      } finally {
        pendingRef.current = false;
        if (restoreInputFocus.current && typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        restoreInputFocus.current = false;
      }
    });
    return true;
  };

  const submitIntent = async (intent: AssistantIntent, text: string, helper?: "patients" | "professionals", options: { userMessageAdded?: boolean; withinPending?: boolean } = {}) => {
    if (!options.withinPending) {
      if (pendingRef.current || isPending) return;
      if (!options.userMessageAdded) append({ author: "user", text });
    }
    const perform = async () => {
      const response = helper ? await submitAssistantContextualHelperAction(intent, helper) : await submitAssistantIntentAction(intent);
      append({ author: "assistant", text: responseText(response), response });
      applyResponse(response, intent);
    };
    if (options.withinPending) return perform();
    runPending(perform);
  };

  const handleResolved = async (resolved: ReturnType<typeof resolveConversationInput>, text: string, options: { userMessageAdded?: boolean; withinPending?: boolean } = {}) => {
    if (!options.userMessageAdded) append({ author: "user", text });
    if (resolved.state === "reset") {
      append({ author: "assistant", text: "Empecemos una nueva consulta." });
      setPendingIntent(null);
      return;
    }
    const parsed = resolved.result;
    if (parsed.state !== "intent") { append({ author: "assistant", text: parsed.message }); if (parsed.state === "needs_input" && parsed.intent) setPendingIntent(parsed.intent); return; }
    await submitIntent(parsed.intent, text, undefined, { userMessageAdded: true, withinPending: options.withinPending });
  };

  const submit = (raw: string = value) => {
    const text = raw.trim();
    if (!text || isPending || pendingRef.current) return;
    setValue("");
    append({ author: "user", text });
    const helper = pendingIntent ? classifyContextualHelper(pendingIntent, text) : null;
    if (helper) { void submitIntent(pendingIntent!, text, helper, { userMessageAdded: true }); return; }
    if (!llmEnabled) { void handleResolved(resolveConversationInput(pendingIntent, text, today), text, { userMessageAdded: true }); return; }
    runPending(async () => {
      try {
        await handleResolved(await planAssistantConversationAction(text, pendingIntent), text, { userMessageAdded: true, withinPending: true });
      } catch {
        await handleResolved(resolveConversationInput(pendingIntent, text, today), text, { userMessageAdded: true, withinPending: true });
      }
    });
  };

  const choose = (choice: AssistantStructuredChoice) => {
    if (isPending || pendingRef.current) return;
    append({ author: "user", text: choice.label });
    runPending(async () => {
      const response = await selectAssistantResultAction(choice, pendingIntent);
      append({ author: "assistant", text: responseText(response), response });
      applyResponse(response, pendingIntent);
    });
  };

  const confirm = () => {
    if (!proposal || isPending || pendingRef.current) return;
    runPending(async () => {
      const response = await confirmAssistantProposalAction(proposal.proposal.actionId);
      const message = response.state === "success"
        ? proposal.action === "Crear cita" ? "Cita creada correctamente." : proposal.action === "Reprogramar cita" ? "Cita reprogramada correctamente." : proposal.action === "Confirmar cita" ? "Cita confirmada correctamente." : "Cita cancelada correctamente."
        : responseText(response);
      append({ author: "assistant", text: message, response });
      if (response.state === "success" || response.state === "proposal_terminal") setProposal(null);
    });
  };

  const cancel = () => {
    if (!proposal || isPending || pendingRef.current) return;
    runPending(async () => {
      const response = await cancelAssistantProposalAction(proposal.proposal.actionId);
      append({ author: "assistant", text: responseText(response), response });
      setProposal(null);
    });
  };

  return (
    <section className="glass-card-strong mb-5 p-5" aria-labelledby="appointment-assistant-title">
      <div className="flex flex-col gap-3 border-b border-[var(--glass-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="appointment-assistant-title" className="flex items-center gap-2 text-lg font-bold text-ink"><CalendarClock className="h-5 w-5 text-clinic" />Appointment Assistant</h2><p className="mt-1 text-sm text-slate-500">Consulta tu agenda y revisa cada acción antes de ejecutarla.</p></div>
        <span className="rounded-full bg-[var(--clinic-soft)] px-3 py-1 text-xs font-bold text-clinic">Sin chat persistente</span>
      </div>
      <div className="mt-4 grid gap-3" aria-live="polite">
        {messages.map((message) => <div key={message.id} className={`max-w-3xl rounded-2xl p-4 text-sm leading-6 ${message.author === "user" ? "ml-auto bg-[var(--clinic-soft)] text-ink" : "clinical-surface text-slate-700"}`}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{message.author === "user" ? "Tú" : "Assistant"}</p><p>{message.text}</p>{message.response?.state === "choices" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{message.response.choices.map((choice) => <Button key={choice.id} type="button" variant="secondary" className="min-h-11 justify-start" onClick={() => choose(choice.choice)} disabled={isPending}>{choice.label}</Button>)}</div> : null}{message.response?.state === "patients" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{message.response.patients.map((patient) => <Button key={patient.id} type="button" variant="secondary" className="min-h-11 justify-start" onClick={() => choose(patient.choice)} disabled={isPending}>{patient.name}</Button>)}</div> : null}{message.response?.state === "professionals" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{message.response.professionals.map((professional) => <Button key={professional.id} type="button" variant="secondary" className="min-h-11 justify-start" onClick={() => choose(professional.choice)} disabled={isPending}>{professional.name}</Button>)}</div> : null}{message.response?.state === "availability_retry" && message.response.alternatives.length ? <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Horarios alternativos">{message.response.alternatives.map((slot) => <Button key={slot.start} type="button" variant="secondary" className="min-h-11 justify-start" onClick={() => choose(slot.choice)} disabled={isPending}><Clock3 className="h-4 w-4 text-clinic" />{slot.start}–{slot.end}</Button>)}</div> : null}{message.response?.state === "slots" ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{message.response.slots.map((slot) => <Button key={slot.start} type="button" variant="secondary" className="min-h-11 justify-start" onClick={() => choose(slot.choice)} disabled={isPending}><Clock3 className="mr-1 h-4 w-4 text-clinic" />{slot.start}–{slot.end}</Button>)}</div> : null}{message.response?.state === "appointments" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{message.response.appointments.map((appointment) => <Button key={appointment.id} type="button" variant="secondary" className="min-h-11 justify-start text-left" onClick={() => choose(appointment.choice)} disabled={isPending}>{appointment.patient} · {appointment.professional ?? "Profesional"} · {formatInstant(appointment.startsAt, timeZone)} · {statusLabel(appointment.status)}</Button>)}</div> : null}<ReadResult response={message.response} timeZone={timeZone} /></div>)}
        {isPending ? <div className="clinical-surface max-w-3xl rounded-2xl p-4 text-sm leading-6 text-slate-700" role="status" aria-live="polite" aria-label={ASSISTANT_PENDING_LABEL}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Assistant</p><p className="inline-flex items-center gap-2"><span>Procesando</span><span className="inline-flex gap-1" aria-hidden="true"><span className="assistant-typing-dot">•</span><span className="assistant-typing-dot assistant-typing-dot-delay-1">•</span><span className="assistant-typing-dot assistant-typing-dot-delay-2">•</span></span></p></div> : null}
        {proposal ? <div className="glass-card mt-2 border-2 border-[var(--clinic)] p-4" aria-label="Propuesta pendiente de confirmación"><p className="text-xs font-bold uppercase tracking-wide text-clinic">Propuesta pendiente</p><h3 className="mt-1 text-lg font-bold text-ink">{proposal.action}</h3><dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">{proposal.patient ? <div><dt className="font-semibold">Paciente</dt><dd>{proposal.patient}</dd></div> : null}{proposal.professional ? <div><dt className="font-semibold">Profesional</dt><dd>{proposal.professional}</dd></div> : null}{proposal.date ? <div><dt className="font-semibold">Fecha</dt><dd>{formatDate(proposal.date, timeZone)}</dd></div> : null}{proposal.time ? <div><dt className="font-semibold">Horario</dt><dd>{proposal.time}</dd></div> : null}{proposal.previous ? <div><dt className="font-semibold">Cita actual</dt><dd>{isNaN(Date.parse(proposal.previous)) ? proposal.previous : formatInstant(proposal.previous, timeZone)}</dd></div> : null}</dl><p className="mt-3 text-xs text-slate-500">Esta propuesta expira en unos minutos y sólo se ejecutará después de confirmar.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={confirm} disabled={isPending}><Check className="h-4 w-4" />Confirmar</Button><Button type="button" variant="secondary" onClick={cancel} disabled={isPending}><X className="h-4 w-4" />Cancelar</Button></div></div> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{["Agendar una cita", "Ver disponibilidad", "Reprogramar una cita", "Cancelar una cita", "Ver citas de hoy"].map((prompt) => <Button key={prompt} type="button" variant="ghost" className="min-h-9 text-xs" onClick={() => submit(prompt)} disabled={isPending}>{prompt}</Button>)}</div>
      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor="assistant-request" className="sr-only">Escribe una solicitud</label><input ref={inputRef} id="assistant-request" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Escribe una solicitud..." className="glass-input min-h-11 min-w-0 flex-1 rounded-xl px-4 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic" disabled={isPending} /><Button type="submit" disabled={isPending || !value.trim()}><Send className="h-4 w-4" />Enviar</Button></form>
    </section>
  );
}
