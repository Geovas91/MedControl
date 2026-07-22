"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Ban, Check, CircleCheck, Clock3, RotateCcw, X } from "lucide-react";
import {
  updateAppointmentStatusAction,
  type AppointmentStatusActionState
} from "@/app/dashboard/appointments/[id]/actions";
import { Button } from "@/components/ui/button";
import type { AppointmentStatusAction } from "@/lib/appointments/status";

function actionIcon(action: AppointmentStatusAction) {
  if (action.outcome === "confirmed") return <Check className="h-4 w-4" />;
  if (action.outcome === "waiting") return <Clock3 className="h-4 w-4" />;
  if (action.outcome === "completed") return <CircleCheck className="h-4 w-4" />;
  if (action.outcome === "cancelled") return <Ban className="h-4 w-4" />;
  return <RotateCcw className="h-4 w-4" />;
}

function StatusSubmitButton({ action }: { action: AppointmentStatusAction }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className={
        action.tone === "danger"
          ? "bg-rose-700 hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
          : "disabled:cursor-not-allowed disabled:opacity-70"
      }
    >
      {pending ? "Guardando..." : action.label}
    </Button>
  );
}

export function AppointmentStatusActions({
  appointmentId,
  currentStatus,
  actions
}: {
  appointmentId: string;
  currentStatus: AppointmentStatusAction["targetStatus"];
  actions: AppointmentStatusAction[];
}) {
  const boundAction = updateAppointmentStatusAction.bind(null, appointmentId);
  const [state, formAction] = useActionState<AppointmentStatusActionState, FormData>(boundAction, {});
  const [selectedAction, setSelectedAction] = useState<AppointmentStatusAction | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  function openDialog(action: AppointmentStatusAction) {
    setSelectedAction(action);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelButtonRef.current?.focus());
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-ink">Acciones de la cita</h2>
      <p className="mt-1 text-sm text-slate-500">Solo se muestran cambios válidos para el estado y horario actuales.</p>

      {actions.length === 0 ? (
        <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
          No hay cambios de estado disponibles para esta cita y tu rol actual.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => (
          <Button
            key={`${action.targetStatus}-${action.outcome}`}
            type="button"
            variant="secondary"
            className={
              action.tone === "danger"
                ? "w-full justify-start text-rose-700 ring-rose-200 hover:bg-rose-50"
                : "w-full justify-start"
            }
            onClick={() => openDialog(action)}
          >
            {actionIcon(action)}
            {action.label}
          </Button>
          ))}
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="appointment-status-dialog-title"
        aria-describedby="appointment-status-dialog-description"
        onClose={() => setSelectedAction(null)}
        className="w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/50"
      >
        {selectedAction ? (
          <form action={formAction} className="p-5 sm:p-6">
            <input type="hidden" name="target_status" value={selectedAction.targetStatus} />
            <input type="hidden" name="expected_current_status" value={currentStatus} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="appointment-status-dialog-title" className="text-lg font-bold text-ink">
                  {selectedAction.title}
                </h3>
                <p id="appointment-status-dialog-description" className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedAction.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink"
                aria-label="Cerrar diálogo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {state.error ? (
              <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {state.error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="inline-flex h-11 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-ink ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Volver
              </button>
              <StatusSubmitButton action={selectedAction} />
            </div>
          </form>
        ) : null}
      </dialog>
    </section>
  );
}
