import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { signUpAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input } from "@/components/ui/input";
import { getSafeLocalPath, isInvitationPath } from "@/lib/auth/redirects";

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const next = getSafeLocalPath(params?.next, "");
  const invitationRegistration = isInvitationPath(next);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="font-bold text-ink">CliniControl</span>
        </Link>
        <h1 className="text-2xl font-bold text-ink">{invitationRegistration ? "Completa tu invitación" : "Crea tu espacio clínico"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {invitationRegistration ? "Crea tu usuario para aceptar la invitación de clínica." : "Crea un usuario con Supabase Auth. La clínica y membresía se completan en el flujo de onboarding."}
        </p>
        {params?.error ? (
          <p className="mt-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{params.error}</p>
        ) : null}
        {params?.message ? (
          <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">{params.message}</p>
        ) : null}
        <form action={signUpAction} className="mt-6 grid gap-4">
          <input type="hidden" name="next" value={next} />
          {!invitationRegistration ? <Field label="Nombre de la clínica" htmlFor="clinic">
            <Input id="clinic" name="clinic" autoComplete="organization" placeholder="Clínica Familiar Norte" required />
          </Field> : null}
          <Field label="Tu nombre" htmlFor="full_name">
            <Input id="full_name" name="full_name" autoComplete="name" placeholder="Dr. Alex Morgan" required />
          </Field>
          <Field label="Email de trabajo" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="doctor@clinic.com" required />
          </Field>
          <Field label="Contraseña" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              required
            />
          </Field>
          <AuthSubmitButton idleLabel="Crear cuenta" pendingLabel="Creando cuenta..." />
        </form>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          {invitationRegistration ? "Después de confirmar tu correo volverás a la invitación para unirte a la clínica." : "Esta fase crea el usuario de autenticación y guarda metadata de registro. La clínica y membresía se completan en onboarding."}
        </p>
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-clinic">
            Iniciar sesión
          </Link>
        </p>
      </section>
    </main>
  );
}
