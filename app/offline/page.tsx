import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sin conexion | CliniControl",
  robots: { index: false, follow: false }
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">
      <section className="clinical-surface w-full max-w-md p-6 text-center sm:p-8">
        <p className="text-sm font-semibold text-clinic">CliniControl</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Sin conexion</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--foreground-soft)]">
          Los datos clinicos requieren una conexion segura. Vuelve a intentarlo cuando recuperes acceso a internet.
        </p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] bg-clinic px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800">
          Reintentar
        </Link>
      </section>
    </main>
  );
}
