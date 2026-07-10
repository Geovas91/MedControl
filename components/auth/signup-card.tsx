"use client";

import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { signUpAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useLanguage } from "@/components/i18n/language-provider";
import { Field, Input } from "@/components/ui/input";
import { brandConfig } from "@/config/brand";

type SignupCardProps = {
  error?: string;
  message?: string;
};

export function SignupCard({ error, message }: SignupCardProps) {
  const { messages } = useLanguage();
  const copy = messages.auth.signup;

  return (
    <section className="w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-soft sm:w-full sm:p-6">
      <div className="mb-8 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-clinic text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="truncate font-bold text-ink">{brandConfig.appName}</span>
        </Link>
        <LanguageToggle />
      </div>
      <h1 className="text-2xl font-bold text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm text-slate-500">{copy.description}</p>
      {error ? <p className="mt-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{error}</p> : null}
      {message ? <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">{message}</p> : null}
      <form action={signUpAction} className="mt-6 grid gap-4">
        <Field label={copy.clinicLabel} htmlFor="clinic">
          <Input id="clinic" name="clinic" autoComplete="organization" placeholder={copy.clinicPlaceholder} required />
        </Field>
        <Field label={copy.nameLabel} htmlFor="full_name">
          <Input id="full_name" name="full_name" autoComplete="name" placeholder={copy.namePlaceholder} required />
        </Field>
        <Field label={copy.emailLabel} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" placeholder={copy.emailPlaceholder} required />
        </Field>
        <Field label={copy.passwordLabel} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            placeholder={copy.passwordPlaceholder}
            required
          />
        </Field>
        <AuthSubmitButton idleLabel={copy.submit} pendingLabel={copy.pending} />
      </form>
      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">{copy.note}</p>
      <p className="mt-6 text-center text-sm text-slate-500">
        {copy.alternatePrefix}{" "}
        <Link href="/login" className="font-semibold text-clinic">
          {copy.alternateCta}
        </Link>
      </p>
    </section>
  );
}
