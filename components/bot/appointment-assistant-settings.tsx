import { Bot, Clock3, LockKeyhole } from "lucide-react";
import { saveAppointmentAssistantSettingsAction } from "@/app/dashboard/bot/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { AppointmentAssistantData } from "@/lib/server/appointment-assistant";

export function AppointmentAssistantSettings({
  settings,
  canManage,
  canWrite
}: {
  settings: AppointmentAssistantData["settings"];
  canManage: boolean;
  canWrite: boolean;
}) {
  if (!canManage) {
    return (
      <section className="surface-card p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] text-[var(--foreground-soft)]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-ink">Configuración</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Puedes consultar la operación de agenda según tu rol. Sólo owner y admin administran las preferencias globales de la clínica.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const configured = Boolean(settings);
  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--clinic-soft)] text-clinic">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-ink">Configuración interna</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Guarda preferencias para una automatización futura. Esta configuración no programa ni envía recordatorios por sí sola.
            </p>
          </div>
        </div>
        <Badge variant={configured && settings?.enabled ? "green" : "slate"}>
          {configured ? (settings?.enabled ? "Configuración habilitada" : "Configuración deshabilitada") : "Sin configurar"}
        </Badge>
      </div>

      <form action={saveAppointmentAssistantSettingsAction} className="mt-5 grid gap-4">
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3 text-sm font-semibold text-ink">
          Habilitar estas reglas guardadas
          <input name="enabled" type="checkbox" defaultChecked={settings?.enabled ?? false} disabled={!canWrite} className="h-5 w-5 rounded border-slate-300" />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Anticipación preferida (horas)" htmlFor="reminder_hours_before">
            <Input id="reminder_hours_before" name="reminder_hours_before" type="number" min={1} max={168} required defaultValue={settings?.reminder_hours_before ?? 24} disabled={!canWrite} />
          </Field>
          <Field label="Inicio de horario silencioso" htmlFor="quiet_hours_start">
            <Input id="quiet_hours_start" name="quiet_hours_start" type="time" defaultValue={settings?.quiet_hours_start?.slice(0, 5) ?? ""} disabled={!canWrite} />
          </Field>
          <Field label="Fin de horario silencioso" htmlFor="quiet_hours_end">
            <Input id="quiet_hours_end" name="quiet_hours_end" type="time" defaultValue={settings?.quiet_hours_end?.slice(0, 5) ?? ""} disabled={!canWrite} />
          </Field>
        </div>
        <p className="flex gap-2 rounded-[var(--radius-md)] bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          La ventana y el horario silencioso quedan almacenados, pero actualmente no existe un scheduler de recordatorios que los ejecute.
        </p>
        <div className="flex justify-end">
          <Button type="submit" disabled={!canWrite}>Guardar configuración</Button>
        </div>
        {!canWrite ? <p className="text-right text-sm text-slate-500">La suscripción actual permite consulta, pero no cambios.</p> : null}
      </form>
    </section>
  );
}
