export default function SupportLoading() {
  return <div role="status" className="grid gap-4" aria-label="Cargando Ayuda y soporte"><div className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" /><div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-muted)]" /><p className="text-sm text-[var(--foreground-muted)]">Cargando Ayuda y soporte…</p></div>;
}
