import { cn } from "@/lib/utils";

const variants = {
  green: "border-emerald-200/90 bg-emerald-50/90 text-emerald-800 ring-emerald-200/70",
  amber: "border-amber-300/90 bg-amber-50 text-amber-900 ring-amber-300/70",
  red: "border-rose-300 bg-rose-50 text-rose-900 ring-rose-300/80",
  slate: "border-slate-300/80 bg-white/70 text-slate-700 ring-slate-300/60",
  teal: "border-teal-200/90 bg-[var(--clinic-soft)] text-teal-800 ring-[var(--clinic-border)]"
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-inset",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
