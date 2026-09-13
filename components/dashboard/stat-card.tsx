import { cn } from "@/lib/utils";
import Link from "next/link";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  href?: string;
  className?: string;
};

export function StatCard({ label, value, detail, icon, href, className }: StatCardProps) {
  const cardClassName = cn(
    "glass-card group relative block overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--clinic-border)] hover:shadow-[var(--shadow-soft)]",
    href && "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200/80",
    className
  );

  const content = (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-teal-100/45 blur-2xl transition group-hover:bg-teal-100/65" />
      <div className="flex items-start justify-between gap-4">
        <div className="relative min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]">{label}</p>
          <p className="mt-2 truncate text-3xl font-bold tracking-[-0.035em] text-ink">{value}</p>
        </div>
        <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(218,244,241,0.88))] text-clinic shadow-[0_10px_22px_rgba(8,124,120,0.12),inset_0_1px_0_#fff]">{icon}</div>
      </div>
      <p className="relative mt-4 text-sm leading-6 text-[var(--foreground-muted)]">{detail}</p>
    </>
  );

  return href ? <Link href={href} className={cardClassName}>{content}</Link> : <section className={cardClassName}>{content}</section>;
}
