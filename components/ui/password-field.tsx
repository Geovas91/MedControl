"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string;
  label: string;
};

export function PasswordField({ id, label, className, ...props }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const actionLabel = `${isVisible ? "Ocultar" : "Mostrar"} ${label.toLocaleLowerCase("es-MX")}`;

  return (
    <div className="grid gap-2 text-sm font-medium text-[var(--foreground-soft)]">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <Input
          {...props}
          id={id}
          type={isVisible ? "text" : "password"}
          className={cn("w-full pr-12", className)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-1 my-auto grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          aria-label={actionLabel}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
