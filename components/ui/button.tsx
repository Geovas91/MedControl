import Link from "next/link";
import { cn } from "@/lib/utils";

const styles = {
  primary: "bg-clinic text-white shadow-soft hover:bg-teal-800",
  secondary: "bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100"
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
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition",
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
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition",
        styles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
