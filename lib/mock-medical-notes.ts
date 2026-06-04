import type { MedicalNote } from "@/types/medical-note";

export const mockMedicalNotes: MedicalNote[] = [
  {
    id: "note-001",
    patientId: "pat-001",
    patientName: "Alicia Ramirez",
    doctorName: "Dr. Morgan",
    specialty: "General Medicine",
    templateId: "general-medicine",
    templateName: "General medical note",
    date: "2026-05-25",
    status: "Finalized",
    clinicalImpression: "Blood pressure follow-up with medication tolerance review."
  },
  {
    id: "note-002",
    patientId: "pat-003",
    patientName: "Nora Bennett",
    doctorName: "Dr. Morgan",
    specialty: "Nutrition",
    templateId: "nutrition",
    templateName: "Nutrition note",
    date: "2026-05-25",
    status: "Draft",
    clinicalImpression: "Nutrition follow-up focused on glucose log and eating pattern review."
  },
  {
    id: "note-003",
    patientId: "pat-002",
    patientName: "Marco Silva",
    doctorName: "Dr. Ellis",
    specialty: "Physiotherapy / Rehabilitation",
    templateId: "physiotherapy-rehabilitation",
    templateName: "Physiotherapy / Rehabilitation note",
    date: "2026-05-24",
    status: "Finalized",
    clinicalImpression: "Post-operative mobility assessment and progressive exercise plan."
  },
  {
    id: "note-004",
    patientId: "pat-004",
    patientName: "Daniel Chen",
    doctorName: "Dr. Ellis",
    specialty: "Dentistry",
    templateId: "dentistry",
    templateName: "Dentistry note",
    date: "2026-05-22",
    status: "Draft",
    clinicalImpression: "Routine dental evaluation with oral examination documentation."
  }
];

export function getMedicalNotesForPatient(patientId: string) {
  return mockMedicalNotes.filter((note) => note.patientId === patientId);
}
