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
        "glass-input h-11 rounded-xl px-3 text-sm text-ink outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-clinic focus:bg-white/95 focus:ring-4 focus:ring-teal-100/80 disabled:bg-[var(--surface-muted)] disabled:text-[var(--foreground-muted)]",
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
        "glass-input h-11 rounded-xl px-3 text-sm text-ink outline-none transition focus:border-clinic focus:bg-white/95 focus:ring-4 focus:ring-teal-100/80 disabled:bg-[var(--surface-muted)] disabled:text-[var(--foreground-muted)]",
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
        "glass-input min-h-28 rounded-xl px-3 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-clinic focus:bg-white/95 focus:ring-4 focus:ring-teal-100/80 disabled:bg-[var(--surface-muted)] disabled:text-[var(--foreground-muted)]",
        className
      )}
      {...props}
    />
  );
}
