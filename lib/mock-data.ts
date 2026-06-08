import type { Appointment, Patient, Payment } from "@/lib/types";

// All mock records are fictional and intended for UI development only.
export const patients: Patient[] = [
  {
    id: "pat-001",
    name: "Alicia Ramirez",
    age: 42,
    gender: "Femenino",
    phone: "+1 (555) 014-8821",
    email: "alicia.ramirez@example.com",
    status: "Active",
    nextVisit: "2026-05-25",
    condition: "Seguimiento de hipertensión",
    allergies: ["Penicilina"],
    notes: "Revisar presión arterial semanal y tolerancia al medicamento."
  },
  {
    id: "pat-002",
    name: "Marco Silva",
    age: 36,
    gender: "Masculino",
    phone: "+1 (555) 017-4088",
    email: "marco.silva@example.com",
    status: "Follow-up",
    nextVisit: "2026-05-26",
    condition: "Revisión posoperatoria",
    allergies: [],
    notes: "Incisión con evolución favorable. Requiere valoración de movilidad en la próxima visita."
  },
  {
    id: "pat-003",
    name: "Nora Bennett",
    age: 58,
    gender: "Femenino",
    phone: "+1 (555) 019-2310",
    email: "nora.bennett@example.com",
    status: "Active",
    nextVisit: "2026-05-25",
    condition: "Control de diabetes",
    allergies: ["Sulfas"],
    notes: "Traer registro de glucosa. Revisar plan de nutrición y tendencia de A1C."
  },
  {
    id: "pat-004",
    name: "Daniel Chen",
    age: 29,
    gender: "Masculino",
    phone: "+1 (555) 012-7764",
    email: "daniel.chen@example.com",
    status: "Inactive",
    nextVisit: "2026-06-04",
    condition: "Revisión anual",
    allergies: [],
    notes: "Sin medicamentos activos. Laboratorios de rutina solicitados antes de la cita."
  }
];

export const appointments: Appointment[] = [
  {
    id: "apt-001",
    patientId: "pat-001",
    patientName: "Alicia Ramirez",
    time: "09:00",
    type: "Seguimiento",
    doctor: "Dr. Morgan",
    status: "Confirmed"
  },
  {
    id: "apt-002",
    patientId: "pat-003",
    patientName: "Nora Bennett",
    time: "10:30",
    type: "Revisión de laboratorio",
    doctor: "Dr. Morgan",
    status: "Waiting"
  },
  {
    id: "apt-003",
    patientId: "pat-002",
    patientName: "Marco Silva",
    time: "12:00",
    type: "Revisión posoperatoria",
    doctor: "Dr. Ellis",
    status: "Confirmed"
  },
  {
    id: "apt-004",
    patientId: "pat-004",
    patientName: "Daniel Chen",
    time: "15:15",
    type: "Exploración física",
    doctor: "Dr. Ellis",
    status: "Completed"
  }
];

export const payments: Payment[] = [
  {
    id: "pay-001",
    patientName: "Alicia Ramirez",
    concept: "Consulta",
    amount: 180,
    status: "Paid",
    date: "2026-05-25"
  },
  {
    id: "pay-002",
    patientName: "Nora Bennett",
    concept: "Revisión de laboratorio",
    amount: 120,
    status: "Pending",
    date: "2026-05-25"
  },
  {
    id: "pay-003",
    patientName: "Marco Silva",
    concept: "Seguimiento de procedimiento",
    amount: 240,
    status: "Pending",
    date: "2026-05-24"
  },
  {
    id: "pay-004",
    patientName: "Daniel Chen",
    concept: "Revisión anual",
    amount: 210,
    status: "Paid",
    date: "2026-05-22"
  }
];
