"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Clock3, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelAssistantProposalAction,
  confirmAssistantProposalAction,
  submitAssistantIntentAction,
  submitAssistantContextualHelperAction,
  type AssistantUiResponse
} from "@/app/dashboard/bot/actions";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { classifyContextualHelper, resolveConversationInput } from "@/lib/assistant/orchestration/conversation";

type Message = { id: number; author: "user" | "assistant"; text: string; response?: AssistantUiResponse };
type Props = { today: string; timeZone: string };

function formatDate(value: string, timeZone: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone }).format(parsed);
}

function formatInstant(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function applyChoice(intent: AssistantIntent, id: string, field: "patient" | "professional" | "appointment") {
  if (field === "patient" && intent.type === "create_appointment") return { ...intent, patientId: id, patientQuery: undefined };
  if (field === "professional" && (intent.type === "create_appointment" || intent.type === "check_availability")) return { ...intent, professionalClinicMemberId: id, professionalQuery: undefined };
  if (field === "appointment" && (intent.type === "confirm_appointment" || intent.type === "cancel_appointment" || intent.type === "reschedule_appointment")) return { ...intent, appointmentId: id, appointmentQuery: undefined };
  return intent;
}

function responseText(response: AssistantUiResponse) {
  if ("message" in response) return response.message;
  if (response.state === "slots") return `Encontré ${response.slots.length} horarios disponibles.`;
  if (response.state === "appointments") return `Encontré ${response.appointments.length} citas.`;
  if (response.state === "proposal") return "Preparé una propuesta para que la revises.";
  return "";
}

export function AppointmentAssistant({ today, timeZone }: Props) {
  const [messages, setMessages] = useState<Message[]>([{ id: 1, author: "assistant", text: "Hola, ¿qué quieres hacer con tu agenda?" }]);
  const [value, setValue] = useState("");
  const [pendingIntent, setPendingIntent] = useState<AssistantIntent | null>(null);
  const [choiceField, setChoiceField] = useState<"patient" | "professional" | "appointment" | null>(null);
  const [proposal, setProposal] = useState<Extract<AssistantUiResponse, { state: "proposal" }> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [nextId, setNextId] = useState(2);

  const append = (message: Message) => { setMessages((current) => [...current, message]); setNextId((current) => current + 1); };

  const submitIntent = (intent: AssistantIntent, text: string, helper?: "patients" | "professionals") => {
    append({ id: nextId, author: "user", text });
    startTransition(async () => {
      const response = helper ? await submitAssistantContextualHelperAction(intent, helper) : await submitAssistantIntentAction(intent);
      append({ id: nextId + 1, author: "assistant", text: responseText(response), response });
      if (response.state === "proposal") { setProposal(response); setPendingIntent(null); setChoiceField(null); }
      else if (response.state === "choices") { setPendingIntent(intent); setChoiceField(response.field); }
      else if (response.state === "availability_retry") { setPendingIntent(response.intent); setChoiceField(null); }
      else if (response.state === "message") setPendingIntent(response.intent ?? intent);
      else { setPendingIntent(null); setChoiceField(null); }
    });
  };

  const submit = (raw: string = value) => {
    const text = raw.trim();
    if (!text || isPending) return;
    setValue("");
    const helper = pendingIntent ? classifyContextualHelper(pendingIntent, text) : null;
    if (helper) { submitIntent(pendingIntent!, text, helper); return; }
    const resolved = resolveConversationInput(pendingIntent, text, today);
    if (resolved.state === "reset") {
      append({ id: nextId, author: "user", text });
      append({ id: nextId + 1, author: "assistant", text: "Empecemos una nueva consulta." });
      setPendingIntent(null);
      setChoiceField(null);
      return;
    }
    const parsed = resolved.result;
    if (parsed.state !== "intent") { append({ id: nextId, author: "user", text }); append({ id: nextId + 1, author: "assistant", text: parsed.message }); if (parsed.state === "needs_input" && parsed.intent) setPendingIntent(parsed.intent); return; }
    submitIntent(parsed.intent, text);
  };

  const choose = (id: string, label: string) => {
    if (!pendingIntent || !choiceField) return;
    const intent = applyChoice(pendingIntent, id, choiceField);
    submitIntent(intent, label);
  };

  const chooseAlternative = (intent: Extract<AssistantIntent, { type: "create_appointment" }>, start: string) => {
    submitIntent({ ...intent, localTime: start }, start);
  };

  const confirm = () => {
    if (!proposal || isPending) return;
    startTransition(async () => {
      const response = await confirmAssistantProposalAction(proposal.proposal.actionId);
      const message = response.state === "success"
        ? proposal.action === "Crear cita" ? "Cita creada correctamente." : proposal.action === "Reprogramar cita" ? "Cita reprogramada correctamente." : proposal.action === "Confirmar cita" ? "Cita confirmada correctamente." : "Cita cancelada correctamente."
        : responseText(response);
      append({ id: nextId, author: "assistant", text: message, response });
      if (response.state === "success") setProposal(null);
    });
  };

  const cancel = () => {
    if (!proposal || isPending) return;
    startTransition(async () => {
      const response = await cancelAssistantProposalAction(proposal.proposal.actionId);
      append({ id: nextId, author: "assistant", text: responseText(response), response });
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
        {messages.map((message) => <div key={message.id} className={`max-w-3xl rounded-2xl p-4 text-sm leading-6 ${message.author === "user" ? "ml-auto bg-[var(--clinic-soft)] text-ink" : "clinical-surface text-slate-700"}`}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{message.author === "user" ? "Tú" : "Assistant"}</p><p>{message.text}</p>{message.response?.state === "choices" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{message.response.choices.map((choice) => <Button key={choice.id} type="button" variant="secondary" className="justify-start" onClick={() => choose(choice.id, choice.label)} disabled={isPending}>{choice.label}</Button>)}</div> : null}{message.response?.state === "availability_retry" && message.response.alternatives.length ? <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Horarios alternativos">{message.response.alternatives.map((slot) => <Button key={slot.start} type="button" variant="secondary" className="justify-start" onClick={() => chooseAlternative((message.response as Extract<AssistantUiResponse, { state: "availability_retry" }>).intent, slot.start)} disabled={isPending}><Clock3 className="h-4 w-4 text-clinic" />{slot.start}–{slot.end}</Button>)}</div> : null}{message.response?.state === "slots" ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{message.response.slots.map((slot) => <span key={slot.start} className="rounded-xl bg-white/80 px-3 py-2 font-semibold text-ink"><Clock3 className="mr-1 inline h-4 w-4 text-clinic" />{slot.start}–{slot.end}</span>)}</div> : null}{message.response?.state === "appointments" ? <div className="mt-3 grid gap-2">{message.response.appointments.map((appointment) => <span key={appointment.id} className="rounded-xl bg-white/80 px-3 py-2 text-slate-700">{appointment.patient} · {appointment.professional ?? "Profesional"} · {formatInstant(appointment.startsAt, timeZone)}</span>)}</div> : null}</div>)}
        {proposal ? <div className="glass-card mt-2 border-2 border-[var(--clinic)] p-4" aria-label="Propuesta pendiente de confirmación"><p className="text-xs font-bold uppercase tracking-wide text-clinic">Propuesta pendiente</p><h3 className="mt-1 text-lg font-bold text-ink">{proposal.action}</h3><dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">{proposal.patient ? <div><dt className="font-semibold">Paciente</dt><dd>{proposal.patient}</dd></div> : null}{proposal.professional ? <div><dt className="font-semibold">Profesional</dt><dd>{proposal.professional}</dd></div> : null}{proposal.date ? <div><dt className="font-semibold">Fecha</dt><dd>{formatDate(proposal.date, timeZone)}</dd></div> : null}{proposal.time ? <div><dt className="font-semibold">Horario</dt><dd>{proposal.time}</dd></div> : null}{proposal.previous ? <div><dt className="font-semibold">Cita actual</dt><dd>{isNaN(Date.parse(proposal.previous)) ? proposal.previous : formatInstant(proposal.previous, timeZone)}</dd></div> : null}</dl><p className="mt-3 text-xs text-slate-500">Esta propuesta expira en unos minutos y sólo se ejecutará después de confirmar.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={confirm} disabled={isPending}><Check className="h-4 w-4" />Confirmar</Button><Button type="button" variant="secondary" onClick={cancel} disabled={isPending}><X className="h-4 w-4" />Cancelar</Button></div></div> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{["Agendar una cita", "Ver disponibilidad", "Reprogramar una cita", "Cancelar una cita", "Ver citas de hoy"].map((prompt) => <Button key={prompt} type="button" variant="ghost" className="min-h-9 text-xs" onClick={() => submit(prompt)} disabled={isPending}>{prompt}</Button>)}</div>
      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor="assistant-request" className="sr-only">Escribe una solicitud</label><input id="assistant-request" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Escribe una solicitud..." className="glass-input min-h-11 min-w-0 flex-1 rounded-xl px-4 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic" disabled={isPending} /><Button type="submit" disabled={isPending || !value.trim()}><Send className="h-4 w-4" />Enviar</Button></form>
    </section>
  );
}
