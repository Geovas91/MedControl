export type PatientStatus = "Active" | "Follow-up" | "Inactive";

export type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  status: PatientStatus;
  nextVisit: string;
  condition: string;
  allergies: string[];
  notes: string;
};

export type Appointment = {
  id: string;
  patientId: string;
  patientName: string;
  time: string;
  type: string;
  doctor: string;
  status: "Confirmed" | "Waiting" | "Completed";
};

export type Payment = {
  id: string;
  patientName: string;
  concept: string;
  amount: number;
  status: "Paid" | "Pending";
  date: string;
};
