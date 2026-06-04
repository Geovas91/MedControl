import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
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
          Supabase Auth client wiring is scaffolded. Sign-in actions will be connected after the first auth phase.
        </p>
        <form className="mt-6 grid gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" placeholder="doctor@clinic.com" />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" placeholder="Password" />
          </Field>
          <Button type="button" className="mt-2 w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          TODO: call the browser Supabase client here, then add dashboard route guards after profiles and clinic
          membership onboarding are wired.
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
