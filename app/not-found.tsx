import Link from "next/link";

export default function NotFound() {
  return <main className="auth-shell grid place-items-center"><section className="auth-card w-full max-w-md p-6 text-center"><h1 className="text-xl font-bold text-ink">Página no encontrada</h1><p className="mt-3 text-sm text-slate-600">La ruta solicitada no está disponible.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-clinic px-4 py-2 text-sm font-semibold text-white">Volver al inicio</Link></section></main>;
}
