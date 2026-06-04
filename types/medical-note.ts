export type MedicalNoteFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "vitals" | "signature";

export type MedicalNoteField = {
  id: string;
  label: string;
  type: MedicalNoteFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type MedicalNoteSection = {
  id: string;
  title: string;
  description?: string;
  fields: MedicalNoteField[];
};

export type MedicalNoteTemplate = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  sections: MedicalNoteSection[];
};

export type MedicalNoteStatus = "Draft" | "Finalized";

export type MedicalNote = {
  id: string;
  patientId: string;
  patientName: string;
  doctorName: string;
  specialty: string;
  templateId: string;
  templateName: string;
  date: string;
  status: MedicalNoteStatus;
  clinicalImpression: string;
};

export type MedicalNoteFormValues = Record<string, string | boolean>;
