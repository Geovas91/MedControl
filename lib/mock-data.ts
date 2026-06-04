import type { Appointment, Patient, Payment } from "@/lib/types";

// All mock records are fictional and intended for UI development only.
export const patients: Patient[] = [
  {
    id: "pat-001",
    name: "Alicia Ramirez",
    age: 42,
    gender: "Female",
    phone: "+1 (555) 014-8821",
    email: "alicia.ramirez@example.com",
    status: "Active",
    nextVisit: "2026-05-25",
    condition: "Hypertension follow-up",
    allergies: ["Penicillin"],
    notes: "Monitor blood pressure weekly and review medication tolerance."
  },
  {
    id: "pat-002",
    name: "Marco Silva",
    age: 36,
    gender: "Male",
    phone: "+1 (555) 017-4088",
    email: "marco.silva@example.com",
    status: "Follow-up",
    nextVisit: "2026-05-26",
    condition: "Post-operative check",
    allergies: [],
    notes: "Incision healing well. Needs mobility assessment at next visit."
  },
  {
    id: "pat-003",
    name: "Nora Bennett",
    age: 58,
    gender: "Female",
    phone: "+1 (555) 019-2310",
    email: "nora.bennett@example.com",
    status: "Active",
    nextVisit: "2026-05-25",
    condition: "Diabetes management",
    allergies: ["Sulfa drugs"],
    notes: "Bring glucose log. Discuss nutrition plan and A1C trend."
  },
  {
    id: "pat-004",
    name: "Daniel Chen",
    age: 29,
    gender: "Male",
    phone: "+1 (555) 012-7764",
    email: "daniel.chen@example.com",
    status: "Inactive",
    nextVisit: "2026-06-04",
    condition: "Annual physical",
    allergies: [],
    notes: "No active medication. Routine labs requested before appointment."
  }
];

export const appointments: Appointment[] = [
  {
    id: "apt-001",
    patientId: "pat-001",
    patientName: "Alicia Ramirez",
    time: "09:00",
    type: "Follow-up",
    doctor: "Dr. Morgan",
    status: "Confirmed"
  },
  {
    id: "apt-002",
    patientId: "pat-003",
    patientName: "Nora Bennett",
    time: "10:30",
    type: "Lab review",
    doctor: "Dr. Morgan",
    status: "Waiting"
  },
  {
    id: "apt-003",
    patientId: "pat-002",
    patientName: "Marco Silva",
    time: "12:00",
    type: "Post-op check",
    doctor: "Dr. Ellis",
    status: "Confirmed"
  },
  {
    id: "apt-004",
    patientId: "pat-004",
    patientName: "Daniel Chen",
    time: "15:15",
    type: "Physical exam",
    doctor: "Dr. Ellis",
    status: "Completed"
  }
];

export const payments: Payment[] = [
  {
    id: "pay-001",
    patientName: "Alicia Ramirez",
    concept: "Consultation",
    amount: 180,
    status: "Paid",
    date: "2026-05-25"
  },
  {
    id: "pay-002",
    patientName: "Nora Bennett",
    concept: "Lab review",
    amount: 120,
    status: "Pending",
    date: "2026-05-25"
  },
  {
    id: "pay-003",
    patientName: "Marco Silva",
    concept: "Procedure follow-up",
    amount: 240,
    status: "Pending",
    date: "2026-05-24"
  },
  {
    id: "pay-004",
    patientName: "Daniel Chen",
    concept: "Annual checkup",
    amount: 210,
    status: "Paid",
    date: "2026-05-22"
  }
];
