"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { validateAvailabilityWeek, WEEKDAYS, WEEKDAY_LABELS, type AvailabilityWeek } from "@/lib/availability/form";
import { saveAvailabilityAction } from "@/app/dashboard/settings/availability/actions";

export function ProfessionalAvailabilityForm({ data }: { data: { role: string; canEdit: boolean; clinic: { timezone: string }; today: string; effectiveFrom: string; professionals: { id: string; name: string }[]; selectedProfessionalId: string; week: AvailabilityWeek } }) {
  const router = useRouter();
  const [week, setWeek] = useState<AvailabilityWeek>(data.week); const [state, action] = useActionState(saveAvailabilityAction, { state: "idle" });
  useEffect(() => { if (state.state === "success") router.refresh(); }, [router, state.state]);
  const update = (day: number, index: number, key: "start" | "end", value: string) => setWeek((current) => ({ ...current, [day]: (current[day] ?? []).map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  return <>
    {data.professionals.length > 1 && data.role !== "doctor" ? <form method="get" className="glass-card mb-4 flex flex-wrap items-end gap-3 p-4"><Field label="Profesional" htmlFor="professional"><Select id="professional" name="professional" defaultValue={data.selectedProfessionalId} onChange={(event) => event.currentTarget.form?.requestSubmit()}>{data.professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field><span className="pb-2 text-sm text-slate-500">Selecciona para cargar su horario.</span></form> : null}
    <form action={action} className="glass-card-strong p-4 sm:p-6"><input type="hidden" name="professional_id" value={data.selectedProfessionalId}/><input type="hidden" name="effective_from" value={data.effectiveFrom}/><input type="hidden" name="intervals" value={JSON.stringify(week)}/>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-ink">Horario recurrente</h2><p className="mt-1 text-sm text-slate-600">Los cambios aplican desde {data.effectiveFrom} y preservan el historial anterior.</p></div><p className="glass-control px-3 py-2 text-sm text-slate-700">Zona horaria: <strong>{data.clinic.timezone}</strong></p></div>
      <div className="grid gap-3">{WEEKDAYS.map((day) => <fieldset key={day} className="clinical-surface grid gap-3 p-3 sm:grid-cols-[7rem_1fr]"><legend className="font-semibold text-ink">{WEEKDAY_LABELS[day]}</legend><div className="grid gap-2">{(week[day] ?? []).map((item, index) => <div key={`${day}-${index}`} className="flex flex-wrap items-end gap-2"><Field label={index === 0 ? "Desde" : `Intervalo ${index + 1}, desde`} htmlFor={`start-${day}-${index}`}><Input id={`start-${day}-${index}`} type="time" value={item.start} onChange={(e) => update(day, index, "start", e.target.value)} disabled={!data.canEdit}/></Field><Field label="Hasta" htmlFor={`end-${day}-${index}`}><Input id={`end-${day}-${index}`} type="time" value={item.end} onChange={(e) => update(day, index, "end", e.target.value)} disabled={!data.canEdit}/></Field><Button type="button" variant="ghost" onClick={() => setWeek((current) => ({ ...current, [day]: (current[day] ?? []).filter((_, i) => i !== index) }))} disabled={!data.canEdit}>Quitar</Button></div>)}<Button type="button" variant="secondary" className="w-fit" onClick={() => setWeek((current) => ({ ...current, [day]: [...(current[day] ?? []), { start: "09:00", end: "17:00" }] }))} disabled={!data.canEdit}>+ Agregar intervalo</Button>{!(week[day] ?? []).length ? <p className="text-sm text-slate-500">Sin horario.</p> : null}</div></fieldset>)}</div>
      {state.state === "error" ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{state.error}</p> : null}{state.state === "success" ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Horario guardado.</p> : null}
      {data.canEdit ? <div className="mt-5 flex justify-end"><Button type="submit" disabled={Boolean(validateAvailabilityWeek(week))}>Guardar horario</Button></div> : <p className="mt-4 text-sm text-slate-500">Tu rol puede consultar el horario, pero no modificarlo.</p>}
    </form>
  </>;
}
