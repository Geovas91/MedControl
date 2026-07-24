import { cn } from "@/lib/utils";

const variants = {
  green: "bg-[var(--success-soft)] text-[var(--success)] ring-emerald-200",
  amber: "bg-[var(--warning-soft)] text-[var(--warning)] ring-amber-200",
  slate: "bg-[var(--surface-muted)] text-[var(--foreground-soft)] ring-[var(--border)]",
  teal: "bg-[var(--clinic-soft)] text-clinic ring-[var(--clinic-border)]"
};

type BadgeProps = {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
};

export function Badge({ children, variant = "slate", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
