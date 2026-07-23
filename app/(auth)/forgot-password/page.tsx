import Link from "next/link";
import { requestPasswordRecoveryAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input } from "@/components/ui/input";

export default async function ForgotPasswordPage({ searchParams }: { searchParams?: Promise<{ message?: string }> }) {
  const params = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft"><h1 className="text-2xl font-bold text-ink">Recupera tu contraseña</h1><p className="mt-2 text-sm text-slate-600">Te enviaremos instrucciones si existe una cuenta con ese correo.</p>{params?.message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{params.message}</p> : null}<form action={requestPasswordRecoveryAction} className="mt-6 grid gap-4"><Field label="Correo" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field><AuthSubmitButton idleLabel="Enviar instrucciones" pendingLabel="Enviando..." /></form><Link href="/login" className="mt-5 inline-block text-sm font-semibold text-clinic">Volver a iniciar sesión</Link></section></main>;
}
