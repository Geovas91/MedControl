"use client";

import { CheckCircle2, PenLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { ConsentSigningToken } from "@/types/consent";

export function ConsentSigningPage({ consent }: { consent: ConsentSigningToken }) {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <section className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-ink">Firma enviada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Esta es una pantalla demo. No se validó una firma legal ni se almacenó información real de pacientes.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <form className="mx-auto grid max-w-xl gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-sm font-semibold text-clinic">{consent.clinicName}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{consent.consentType}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {consent.doctorName} · {consent.patientName}
          </p>
        </header>

        <section className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p>{consent.consentText}</p>
          <p className="mt-3 font-semibold text-ink">Recordatorio de aviso de privacidad</p>
          <p className="mt-1">{consent.privacyNotice}</p>
        </section>

        <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          Esta plantilla de consentimiento debe revisarse y personalizarse por un profesional legal y de cumplimiento
          sanitario antes de cualquier uso real.
        </p>

        <label className="flex gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-clinic" />
          He leído y entendido este consentimiento.
        </label>
        <label className="flex gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-clinic" />
          Acepto el tratamiento de mis datos personales y datos relacionados con salud.
        </label>

        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <PenLine className="mx-auto h-6 w-6 text-clinic" />
          <p className="mt-2 text-sm font-semibold text-ink">Área de firma demo</p>
          <p className="mt-1 text-xs text-slate-500">La captura y validación de firma real todavía no están implementadas.</p>
        </div>

        <Field label="Nombre completo" htmlFor="full-name">
          <Input id="full-name" placeholder="Escribe tu nombre completo" />
        </Field>

        <Button type="button" onClick={() => setSubmitted(true)}>
          Enviar firma demo
        </Button>
      </form>
    </main>
  );
}
