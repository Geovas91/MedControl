"use client";

import { useActionState, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { addClinicMemberAction } from "@/app/dashboard/members/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddMemberForm({ canAddDoctor }: { canAddDoctor: boolean }) {
  const [state, formAction] = useActionState(addClinicMemberAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-clinic">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Invitar miembro</h2>
          <p className="text-sm text-slate-500">Crea un enlace personal para que el miembro complete su acceso.</p>
        </div>
      </div>

      {state.error ? <p aria-live="polite" className="mt-5 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? (
        <p aria-live="polite" className="mt-5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p>
      ) : null}
      {state.invitationUrl ? <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700"><p>El enlace es personal y se muestra sólo en esta respuesta.</p><input readOnly aria-label="Enlace de invitación para copiar" value={state.invitationUrl} className="mt-2 w-full rounded border border-slate-200 bg-white p-2 text-xs" onFocus={(event) => event.currentTarget.select()} /><Button type="button" variant="secondary" className="mt-2" onClick={async () => { try { if (!navigator.clipboard) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(state.invitationUrl ?? ""); setCopied(true); } catch { setCopied(false); } }}><Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Enlace copiado" : "Copiar enlace"}</Button>{!copied ? <p className="mt-2 text-xs text-slate-500">Si no puedes copiarlo con el botón, selecciónalo en el campo.</p> : null}</div> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Correo" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="medico@clinica.com" required />
        </Field>
        <Field label="Rol" htmlFor="role">
          <Select id="role" name="role" defaultValue="doctor" required>
            <option value="doctor" disabled={!canAddDoctor}>
              Médico
            </option>
            <option value="admin">Administrador</option>
            <option value="assistant">Asistente</option>
          </Select>
        </Field>
      </div>

      {!canAddDoctor ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          El límite de médicos de tu plan ya está completo. Aún puedes agregar roles administrativos o asistentes.
        </p>
      ) : null}

      <div className="mt-5">
        <AuthSubmitButton idleLabel="Crear invitación" pendingLabel="Creando invitación..." />
      </div>
    </form>
  );
}
