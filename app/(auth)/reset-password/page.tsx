import Link from "next/link";
import { updatePasswordAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input } from "@/components/ui/input";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft"><h1 className="text-2xl font-bold text-ink">Define una nueva contraseña</h1>{params?.error ? <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{params.error}</p> : null}<form action={updatePasswordAction} className="mt-6 grid gap-4"><Field label="Nueva contraseña" htmlFor="password"><Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></Field><Field label="Confirmar contraseña" htmlFor="confirmation"><Input id="confirmation" name="confirmation" type="password" minLength={8} autoComplete="new-password" required /></Field><AuthSubmitButton idleLabel="Actualizar contraseña" pendingLabel="Actualizando..." /></form><Link href="/login" className="mt-5 inline-block text-sm font-semibold text-clinic">Volver a iniciar sesión</Link></section></main>;
}
