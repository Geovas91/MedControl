import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { signUpAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input } from "@/components/ui/input";

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="font-bold text-ink">MedControl</span>
        </Link>
        <h1 className="text-2xl font-bold text-ink">Create your clinic workspace</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create a Supabase Auth user. Clinic workspace provisioning will be completed in the next onboarding phase.
        </p>
        {params?.error ? (
          <p className="mt-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{params.error}</p>
        ) : null}
        {params?.message ? (
          <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">{params.message}</p>
        ) : null}
        <form action={signUpAction} className="mt-6 grid gap-4">
          <Field label="Clinic name" htmlFor="clinic">
            <Input id="clinic" name="clinic" autoComplete="organization" placeholder="Northside Family Clinic" required />
          </Field>
          <Field label="Your name" htmlFor="full_name">
            <Input id="full_name" name="full_name" autoComplete="name" placeholder="Dr. Alex Morgan" required />
          </Field>
          <Field label="Work email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="doctor@clinic.com" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              placeholder="Minimum 6 characters"
              required
            />
          </Field>
          <AuthSubmitButton idleLabel="Create account" pendingLabel="Creating account..." />
        </form>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          This phase creates the auth user and stores signup metadata. Clinic and membership records are still part of
          the next onboarding phase.
        </p>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-clinic">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
