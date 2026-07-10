"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { addClinicMemberAction } from "@/app/dashboard/members/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select } from "@/components/ui/input";

export function AddMemberForm({ canAddDoctor }: { canAddDoctor: boolean }) {
  const [state, formAction] = useActionState(addClinicMemberAction, {});

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-clinic">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Agregar miembro</h2>
          <p className="text-sm text-slate-500">Agrega un usuario que ya tenga cuenta en CliniControl.</p>
        </div>
      </div>

      {state.error ? <p className="mt-5 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? (
        <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Field label="Nombre" htmlFor="full_name">
          <Input id="full_name" name="full_name" placeholder="Dra. Ana López" required />
        </Field>
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
        <AuthSubmitButton idleLabel="Agregar miembro" pendingLabel="Agregando miembro..." />
      </div>
    </form>
  );
}
