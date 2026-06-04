"use client";

import type { MedicalNoteTemplate } from "@/types/medical-note";
import { Field, Select } from "@/components/ui/input";

type TemplateSelectorProps = {
  templates: MedicalNoteTemplate[];
  selectedTemplateId: string;
  onChange: (templateId: string) => void;
};

export function TemplateSelector({ templates, selectedTemplateId, onChange }: TemplateSelectorProps) {
  return (
    <Field label="Template" htmlFor="template">
      <Select id="template" value={selectedTemplateId} onChange={(event) => onChange(event.target.value)}>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.specialty} - {template.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
