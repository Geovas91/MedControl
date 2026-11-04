export const STAGING = 'https://staging.clinicontrol.mx';
export const PROJECT = 'https://fnknctihnrryntkjqxeo.supabase.co';
export type Gate = { state: 'verified' | 'blocked' | 'unknown'; source: string };
export type Slot = { date: string; time: string; startsAt: string; endsAt: string };
export type Scope = { actor: string; clinic: string; professional: string; professionalUser: string; professionalName: string; clinicName: string; timeZone: string };
export type Preflight = { origin: string; project: string; scope: Scope; slots: Slot[]; checkedAt: number; gates: Record<string, Gate> };
export const requiredGates = ['authenticatedQa', 'qaTenant', 'permissions', 'professional', 'patientEligibility', 'availability', 'email', 'automations', 'calendar', 'whatsapp', 'cleanup', 'deployment'] as const;
export function blockers(flight: Preflight, now = Date.now()) {
  return [
    ...(flight.origin !== STAGING ? ['origin'] : []),
    ...(flight.project !== PROJECT ? ['project'] : []),
    ...(flight.checkedAt > now || now - flight.checkedAt > 60_000 ? ['stale_preflight'] : []),
    ...requiredGates.filter(key => flight.gates[key]?.state !== 'verified'),
    ...(flight.slots.length < 2 || flight.slots.some(slot => Date.parse(slot.startsAt) <= now || Date.parse(slot.endsAt) - Date.parse(slot.startsAt) !== 30 * 60_000 || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(slot.time)) || flight.slots[0]?.startsAt === flight.slots[1]?.startsAt ? ['slots'] : [])
  ];
}
export type Patient = { id: string; clinic: string; name: string; createdBy: string; createdAt: string; status: string };
export type Appointment = { id: string; clinic: string; patient: string; professional: string; startsAt: string; endsAt: string; status: string; createdAt: string; createdBy: string };
export type Proposal = { id: string; kind: 'create' | 'reschedule' | 'cancel'; status: string; patient?: string; appointment?: string; clinic: string; actor: string; professional?: string; date?: string; time?: string; duration?: number; mutationExecuted: boolean };
export type Journal = {
  version: 1; run: string; startedAt: string; scope: Scope; patientName: string; phone: string;
  patient?: string; appointments: string[]; proposals: string[];
  step: string; state: 'running' | 'failed' | 'clean'; revision: number;
};
export interface JournalStore { read(): Journal; save(next: Journal): void; }
export interface LifecycleAdapter {
  preflight(patient?: string): Promise<Preflight>;
  findPatients(journal: Journal): Promise<Patient[]>;
  createPatient(journal: Journal): Promise<void>;
  appointments(journal: Journal): Promise<Appointment[]>;
  proposals(journal: Journal): Promise<Proposal[]>;
  prepare(journal: Journal, kind: Proposal['kind'], slot?: Slot): Promise<void>;
  confirm(journal: Journal, duplicate?: boolean): Promise<void>;
  assertRead(journal: Journal, slot: Slot): Promise<void>;
  audit(journal: Journal, appointment: string): Promise<string[]>;
  assertOneShot(journal: Journal, proposal: Proposal): Promise<void>;
  cancelProposal(journal: Journal, proposal: Proposal): Promise<void>;
  retirePatient(journal: Journal): Promise<void>;
  isPatientRetired(journal: Journal): Promise<boolean>;
  isolation?(journal: Journal): Promise<boolean>;
}
export class QaError extends Error { readonly code: string; constructor(code: string) { super(code); this.code = code; } }
export function requireQa(condition: unknown, code: string): asserts condition { if (!condition) throw new QaError(code); }
