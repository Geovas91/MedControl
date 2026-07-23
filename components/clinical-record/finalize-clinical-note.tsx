"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type FormState = { error?: string };

function FinalizeSubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} className="disabled:cursor-not-allowed disabled:opacity-70">{pending ? "Finalizando..." : "Finalizar nota"}</Button>;
}

export function FinalizeClinicalNote({ action, expectedUpdatedAt }: { action: (state: FormState, formData: FormData) => Promise<FormState>; expectedUpdatedAt: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function openDialog() {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={openDialog} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50"><CheckCircle2 className="h-4 w-4" />Finalizar nota</button>
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finalize-clinical-note-title"
        aria-describedby="finalize-clinical-note-description"
        onClose={() => requestAnimationFrame(() => triggerRef.current?.focus())}
        className="w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/50"
      >
        <form action={formAction} className="p-5 sm:p-6">
          <input type="hidden" name="expected_updated_at" value={expectedUpdatedAt} />
          <input type="hidden" name="expected_status" value="draft" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="finalize-clinical-note-title" className="text-lg font-bold text-ink">Finalizar nota clínica</h2>
              <p id="finalize-clinical-note-description" className="mt-2 text-sm leading-6 text-slate-600">Una nota finalizada ya no podrá editarse. Revisa cuidadosamente su contenido antes de continuar.</p>
            </div>
            <button type="button" onClick={closeDialog} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label="Cerrar diálogo"><X className="h-4 w-4" /></button>
          </div>
          {state.error ? <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button ref={cancelRef} type="button" onClick={closeDialog} className="inline-flex h-11 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-ink ring-1 ring-slate-200 hover:bg-slate-50">Cancelar</button>
            <FinalizeSubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}
