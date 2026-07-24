import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { signInAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input } from "@/components/ui/input";
import { getSafeLocalPath } from "@/lib/auth/redirects";

type AuthPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const next = getSafeLocalPath(params?.next, "");
  const forgotPasswordHref = next ? `/forgot-password?next=${encodeURIComponent(next)}` : "/forgot-password";

  return (
    <main className="auth-shell grid place-items-center">
      <section className="auth-card w-full max-w-md p-6 sm:p-7">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="font-bold text-ink">CliniControl</span>
        </Link>
        <h1 className="text-2xl font-bold text-ink">Bienvenido de nuevo</h1>
        <p className="mt-2 text-sm text-slate-500">
          Inicia sesión con Supabase Auth cuando las variables de entorno del proyecto estén configuradas.
        </p>
        {params?.error ? (
          <p className="mt-5 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{params.error}</p>
        ) : null}
        {params?.message ? (
          <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">{params.message}</p>
        ) : null}
        <form action={signInAction} className="mt-6 grid gap-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="doctor@clinic.com" required />
          </Field>
          <Field label="Contraseña" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña"
              required
            />
          </Field>
          <AuthSubmitButton idleLabel="Iniciar sesión" pendingLabel="Iniciando sesión..." />
        </form>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          El dashboard se valida con sesión, onboarding y membresía de clínica.
        </p>
        <p className="mt-4 text-sm"><Link href={forgotPasswordHref} className="font-semibold text-clinic">¿Olvidaste tu contraseña?</Link></p>
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Nuevo en CliniControl?{" "}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-clinic">
            Crear cuenta
          </Link>
        </p>
      </section>
    </main>
  );
}
