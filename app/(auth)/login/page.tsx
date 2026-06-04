import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { signInAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input } from "@/components/ui/input";

type AuthPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: AuthPageProps) {
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
        <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with Supabase Auth when your project environment variables are configured.
        </p>
        {params?.error ? (
          <p className="mt-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{params.error}</p>
        ) : null}
        {params?.message ? (
          <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">{params.message}</p>
        ) : null}
        <form action={signInAction} className="mt-6 grid gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="doctor@clinic.com" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              required
            />
          </Field>
          <AuthSubmitButton idleLabel="Sign in" pendingLabel="Signing in..." />
        </form>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          Dashboard route guards will be enabled after profile and clinic membership onboarding is connected.
        </p>
        <p className="mt-6 text-center text-sm text-slate-500">
          New to MedControl?{" "}
          <Link href="/register" className="font-semibold text-clinic">
            Create account
          </Link>
        </p>
      </section>
    </main>
  );
}
