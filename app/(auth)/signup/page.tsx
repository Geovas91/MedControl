import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
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
          Registration remains UI-first while Supabase Auth, profiles, and clinic memberships are phased in.
        </p>
        <form className="mt-6 grid gap-4">
          <Field label="Clinic name" htmlFor="clinic">
            <Input id="clinic" placeholder="Northside Family Clinic" />
          </Field>
          <Field label="Your name" htmlFor="full_name">
            <Input id="full_name" placeholder="Dr. Alex Morgan" />
          </Field>
          <Field label="Work email" htmlFor="email">
            <Input id="email" type="email" placeholder="doctor@clinic.com" />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" placeholder="Minimum 6 characters" />
          </Field>
          <Button type="button" className="mt-2 w-full">
            Create account
          </Button>
        </form>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          TODO: create the auth user, profile, clinic, and clinic membership in a server action once RLS is validated.
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
