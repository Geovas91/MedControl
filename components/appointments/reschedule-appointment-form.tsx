"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { rescheduleAppointmentAction, type RescheduleActionState } from "@/app/dashboard/appointments/[id]/reschedule/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfessionalSlot } from "@/lib/server/professional-slots";

const initialState: RescheduleActionState = {};

export function RescheduleAppointmentForm({ appointmentId, date, time, status, slots, returnHref }: { appointmentId: string; date: string; time: string; status: string; slots: ProfessionalSlot[]; returnHref: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(rescheduleAppointmentAction.bind(null, appointmentId), initialState);
  return (
    <form action={formAction} className="glass-card-strong grid gap-6 p-4 sm:p-6">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-clinic"><CalendarClock className="h-5 w-5" /></div><div><h2 className="font-bold text-ink">Nuevo horario</h2><p className="mt-1 text-sm text-slate-500">Selecciona un espacio disponible. La cita se actualiza de forma segura.</p></div></div>
      {state.error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      <input type="hidden" name="expected_status" value={status} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor="date">Fecha<input id="date" name="date" type="date" defaultValue={date} required className="glass-input" onChange={(event) => { const value = event.currentTarget.value; if (value) router.push(`/dashboard/appointments/${appointmentId}/reschedule?date=${encodeURIComponent(value)}`); }} /></label>
        <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor="start_time">Hora de inicio<input id="start_time" name="start_time" type="time" step={60} defaultValue={time} required className="glass-input" /></label>
      </div>
      <div className="grid gap-2"><p className="text-sm font-semibold text-ink">Horarios disponibles</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{slots.map((slot) => <button key={slot.start_at} type="button" onClick={(event) => { const input = document.getElementById("start_time") as HTMLInputElement | null; if (input) input.value = slot.local_start; document.querySelectorAll("[data-slot]").forEach((node) => node.classList.remove("ring-2", "ring-clinic")); event.currentTarget.classList.add("ring-2", "ring-clinic"); }} data-slot className="glass-control rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-white/80">{slot.local_start}–{slot.local_end}</button>)}</div>{slots.length === 0 ? <p className="text-sm text-slate-600">No hay espacios disponibles para esta fecha.</p> : null}</div>
      <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row"><ButtonLink href={returnHref} variant="secondary" className="sm:w-40">Cancelar</ButtonLink><div className="w-full sm:w-52"><AuthSubmitButton idleLabel="Reprogramar cita" pendingLabel="Guardando..." /></div></div>
    </form>
  );
}
