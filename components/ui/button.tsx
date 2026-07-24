import Link from "next/link";
import { cn } from "@/lib/utils";

const styles = {
  primary: "bg-clinic text-white shadow-xs hover:bg-[var(--clinic-hover)]",
  secondary: "border border-[var(--border)] bg-white text-ink shadow-xs hover:bg-[var(--surface-muted)]",
  ghost: "text-[var(--foreground-soft)] hover:bg-[var(--surface-muted)]"
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 text-sm font-semibold transition duration-150 disabled:pointer-events-none disabled:opacity-55",
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 text-sm font-semibold transition duration-150 disabled:pointer-events-none disabled:opacity-55",
        styles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
