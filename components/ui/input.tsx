import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className="grid gap-2 text-sm font-medium text-[var(--foreground-soft)]">
      {label}
      {children}
    </label>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-3 text-sm text-ink outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-clinic focus:ring-4 focus:ring-teal-100 disabled:bg-[var(--surface-muted)] disabled:text-[var(--foreground-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-3 text-sm text-ink outline-none transition focus:border-clinic focus:ring-4 focus:ring-teal-100 disabled:bg-[var(--surface-muted)] disabled:text-[var(--foreground-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-3 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-clinic focus:ring-4 focus:ring-teal-100 disabled:bg-[var(--surface-muted)] disabled:text-[var(--foreground-muted)]",
        className
      )}
      {...props}
    />
  );
}
