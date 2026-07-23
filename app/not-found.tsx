import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft"><h1 className="text-xl font-bold text-ink">Página no encontrada</h1><p className="mt-3 text-sm text-slate-600">La ruta solicitada no está disponible.</p><Link href="/" className="mt-6 inline-flex rounded-md bg-clinic px-4 py-2 text-sm font-semibold text-white">Volver al inicio</Link></section></main>;
}
