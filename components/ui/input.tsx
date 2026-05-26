import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-clinic focus:ring-4 focus:ring-teal-100",
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
        "h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-clinic focus:ring-4 focus:ring-teal-100",
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
        "min-h-28 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-clinic focus:ring-4 focus:ring-teal-100",
        className
      )}
      {...props}
    />
  );
}
