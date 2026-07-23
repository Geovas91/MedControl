"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Application route error", { digest: error.digest }); }, [error.digest]);
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft"><h1 className="text-xl font-bold text-ink">No pudimos cargar esta página</h1><p className="mt-3 text-sm leading-6 text-slate-600">Intenta nuevamente. Si el problema continúa, vuelve al inicio.</p>{error.digest ? <p className="mt-3 text-xs text-slate-500">Referencia: {error.digest}</p> : null}<div className="mt-6 flex justify-center gap-3"><button type="button" onClick={reset} className="rounded-md bg-clinic px-4 py-2 text-sm font-semibold text-white">Reintentar</button><Link href="/" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Inicio</Link></div></section></main>;
}
