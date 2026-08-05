import Link from "next/link";
import { updatePasswordAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { PasswordField } from "@/components/ui/password-field";
import { getSafeLocalPath } from "@/lib/auth/redirects";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = getSafeLocalPath(params?.next, "");
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft"><h1 className="text-2xl font-bold text-ink">Define una nueva contraseña</h1>{params?.error ? <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{params.error}</p> : null}<form action={updatePasswordAction} className="mt-6 grid gap-4"><input type="hidden" name="next" value={next} /><PasswordField id="password" label="Nueva contraseña" name="password" minLength={8} autoComplete="new-password" required /><PasswordField id="confirmation" label="Confirmar contraseña" name="confirmation" minLength={8} autoComplete="new-password" required /><AuthSubmitButton idleLabel="Actualizar contraseña" pendingLabel="Actualizando..." /></form><Link href={loginHref} className="mt-5 inline-block text-sm font-semibold text-clinic">Volver a iniciar sesión</Link></section></main>;
}
