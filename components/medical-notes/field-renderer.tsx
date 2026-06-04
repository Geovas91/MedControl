"use client";

import type { MedicalNoteField, MedicalNoteFormValues } from "@/types/medical-note";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

type FieldRendererProps = {
  field: MedicalNoteField;
  value: string | boolean | undefined;
  onChange: (fieldId: string, value: string | boolean) => void;
};

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  if (field.type === "textarea") {
    return (
      <Field label={field.label} htmlFor={field.id}>
        <Textarea
          id={field.id}
          required={field.required}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      </Field>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} htmlFor={field.id}>
        <Select
          id={field.id}
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.id, event.target.value)}
        >
          <option value="">Select an option</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label htmlFor={field.id} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <input
          id={field.id}
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-clinic focus:ring-teal-100"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.id, event.target.checked)}
        />
        <span>
          <span className="font-medium text-ink">{field.label}</span>
          {field.placeholder ? <span className="block text-slate-500">{field.placeholder}</span> : null}
        </span>
      </label>
    );
  }

  if (field.type === "signature") {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-sm font-medium text-ink">{field.label}</p>
        <div className="mt-8 border-t border-slate-300 pt-2 text-xs text-slate-500">Signature placeholder</div>
      </div>
    );
  }

  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <Field label={field.label} htmlFor={field.id}>
      <Input
        id={field.id}
        type={inputType}
        required={field.required}
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(field.id, event.target.value)}
      />
    </Field>
  );
}

export function getDisplayValue(values: MedicalNoteFormValues, fieldId: string) {
  const value = values[fieldId];
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return value || "Not recorded";
}
