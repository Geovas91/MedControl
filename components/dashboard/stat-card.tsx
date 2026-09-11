import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  className?: string;
};

export function StatCard({ label, value, detail, icon, className }: StatCardProps) {
  return (
    <section className={cn("glass-card group relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--clinic-border)] hover:shadow-[var(--shadow-soft)]", className)}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-teal-100/45 blur-2xl transition group-hover:bg-teal-100/65" />
      <div className="flex items-start justify-between gap-4">
        <div className="relative min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]">{label}</p>
          <p className="mt-2 truncate text-3xl font-bold tracking-[-0.035em] text-ink">{value}</p>
        </div>
        <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(218,244,241,0.88))] text-clinic shadow-[0_10px_22px_rgba(8,124,120,0.12),inset_0_1px_0_#fff]">{icon}</div>
      </div>
      <p className="relative mt-4 text-sm leading-6 text-[var(--foreground-muted)]">{detail}</p>
    </section>
  );
}
