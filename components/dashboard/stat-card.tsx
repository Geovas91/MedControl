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
    <section className={cn("surface-card p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-[var(--clinic-soft)] text-clinic">{icon}</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">{detail}</p>
    </section>
  );
}
