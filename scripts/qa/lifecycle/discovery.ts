import { requireQa, type Slot } from './contracts.ts';

type Row = Record<string, unknown>;
type Candidate = { id: string; user_id: string; full_name: string };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function qaProfessionals(rows: Row[], requested?: string): Candidate[] {
  const eligible = rows.filter(row => uuid(row.id) && uuid(row.user_id) && row.status === 'active' && row.is_professional === true && typeof row.full_name === 'string' && row.full_name.startsWith('QA ')) as Candidate[];
  const selected = requested === undefined ? eligible.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 5) : eligible.filter(row => row.id === requested);
  requireQa(selected.length > 0 && new Set(selected.map(row => row.id)).size === selected.length, 'valid_qa_professional_required');
  return selected;
}

export function futureDates(today: string, requested?: string): string[] {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  requireQa(valid(today), 'invalid_clinic_date');
  if (requested !== undefined) { requireQa(valid(requested) && requested > today, 'future_qa_date_required'); return [requested]; }
  return Array.from({ length: 14 }, (_, index) => new Date(Date.parse(`${today}T12:00:00Z`) + (index + 1) * 86400_000).toISOString().slice(0, 10));
}

export function canonicalSlots(rows: Row[], date: string, now = Date.now()): Slot[] {
  requireQa(rows.length <= 1440, 'slot_read_truncated_or_unbounded');
  const slots = rows.filter(row => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(String(row.local_start)) && Date.parse(String(row.start_at)) > now && Date.parse(String(row.end_at)) - Date.parse(String(row.start_at)) === 1800_000)
    .map(row => ({ date, time: String(row.local_start), startsAt: String(row.start_at), endsAt: String(row.end_at) })).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return slots.filter((slot, index) => index === 0 || slot.startsAt !== slots[index - 1].startsAt);
}

export async function discoverSchedule(candidates: Candidate[], dates: string[], read: (member: string, date: string) => Promise<Row[]>, now = Date.now()) {
  requireQa(candidates.length > 0 && candidates.length <= 5 && dates.length > 0 && dates.length <= 14, 'discovery_scope_invalid');
  for (const date of dates) for (const professional of candidates) {
    const slots = canonicalSlots(await read(professional.id, date), date, now);
    if (slots.length >= 2) return { professional, date, slots: slots.slice(0, 2) };
  }
  // Return a bounded, stable scope with a failing availability gate; never invent slots.
  return { professional: candidates[0], date: dates[0], slots: [] as Slot[] };
}
