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
          <h1 className="mt-5 text-2xl font-bold text-ink">Signature submitted</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This is a mock success screen. No legal signature was validated and no real patient information was stored.
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
          <p className="mt-3 font-semibold text-ink">Privacy notice reminder</p>
          <p className="mt-1">{consent.privacyNotice}</p>
        </section>

        <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          This consent template must be reviewed and customized by a legal/healthcare compliance professional before
          real use.
        </p>

        <label className="flex gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-clinic" />
          I have read and understood this consent.
        </label>
        <label className="flex gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-clinic" />
          I consent to the processing of my personal and health-related data.
        </label>

        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <PenLine className="mx-auto h-6 w-6 text-clinic" />
          <p className="mt-2 text-sm font-semibold text-ink">Signature pad placeholder</p>
          <p className="mt-1 text-xs text-slate-500">Real signature capture and validation are not implemented.</p>
        </div>

        <Field label="Full name" htmlFor="full-name">
          <Input id="full-name" placeholder="Type your full name" />
        </Field>

        <Button type="button" onClick={() => setSubmitted(true)}>
          Submit signature
        </Button>
      </form>
    </main>
  );
}
