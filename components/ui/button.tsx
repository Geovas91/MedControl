import Link from "next/link";
import { cn } from "@/lib/utils";

const styles = {
  primary: "border border-teal-700/20 bg-[linear-gradient(135deg,var(--clinic),#0b918a)] text-white shadow-[0_10px_24px_rgba(8,124,120,0.22),inset_0_1px_0_rgba(255,255,255,0.25)] hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,var(--clinic-hover),#087c78)] hover:shadow-[0_14px_28px_rgba(8,124,120,0.25)]",
  secondary: "glass-control text-ink hover:-translate-y-0.5",
  ghost: "border border-transparent text-[var(--foreground-soft)] hover:border-white/70 hover:bg-white/60 hover:text-ink",
  danger: "border border-rose-700/20 bg-[linear-gradient(135deg,#be123c,#dc2626)] text-white shadow-[0_10px_24px_rgba(190,18,60,0.2),inset_0_1px_0_rgba(255,255,255,0.22)] hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,#9f1239,#be123c)]"
};

type BaseProps = {
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof styles;
};

type ButtonLinkProps = BaseProps & {
  href: string;
};

export function ButtonLink({ children, className, href, variant = "primary" }: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-150 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-55",
        styles[variant],
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-150 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-55",
        styles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
