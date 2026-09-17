export type AssistantIntent =
  | { type: "search_patients"; query: string }
  | { type: "search_appointments"; query?: string; patientId?: string; professionalId?: string; localDate?: string }
  | { type: "check_availability"; professionalQuery?: string; professionalClinicMemberId?: string; localDate?: string; durationMinutes: number }
  | { type: "create_appointment"; patientQuery?: string; patientId?: string; professionalQuery?: string; professionalClinicMemberId?: string; localDate?: string; localTime?: string; durationMinutes: number }
  | { type: "confirm_appointment" | "cancel_appointment"; appointmentQuery?: string; appointmentId?: string; expectedStatus?: string }
  | { type: "reschedule_appointment"; appointmentQuery?: string; appointmentId?: string; expectedStatus?: string; localDate?: string; localTime?: string; durationMinutes: number };

export type AssistantOrchestrationState = "READY" | "NEEDS_INPUT" | "AMBIGUOUS" | "NO_AVAILABILITY" | "PROPOSAL_READY" | "FAILED";

export function resolveUniqueEntity<T extends { id: string }>(matches: readonly T[]) {
  if (matches.length === 0) return { state: "NEEDS_INPUT" as const, value: null };
  if (matches.length > 1) return { state: "AMBIGUOUS" as const, value: null };
  return { state: "READY" as const, value: matches[0] };
}

export function planAppointmentProposal<T extends { id: string }>({
  patientMatches,
  professionalMatches,
  availableSlots,
}: {
  patientMatches: readonly T[];
  professionalMatches: readonly T[];
  availableSlots: readonly unknown[];
}): { state: AssistantOrchestrationState; patientId?: string; professionalId?: string } {
  const patient = resolveUniqueEntity(patientMatches);
  if (patient.state !== "READY") return { state: patient.state };
  const professional = resolveUniqueEntity(professionalMatches);
  if (professional.state !== "READY") return { state: professional.state };
  if (availableSlots.length === 0) return { state: "NO_AVAILABILITY" };
  return { state: "PROPOSAL_READY", patientId: patient.value.id, professionalId: professional.value.id };
}

// This only plans a confirmation proposal. It never invokes a mutation tool.
export function planAppointmentMutation<T extends { id: string }>(matches: readonly T[], availableSlots?: readonly unknown[]) {
  const appointment = resolveUniqueEntity(matches);
  if (appointment.state !== "READY") return { state: appointment.state };
  if (availableSlots && availableSlots.length === 0) return { state: "NO_AVAILABILITY" as const };
  return { state: "PROPOSAL_READY" as const, appointmentId: appointment.value.id };
}
