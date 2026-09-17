import { isCanonicalAppointmentDate, isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";

export type ParserResult =
  | { state: "intent"; intent: AssistantIntent }
  | { state: "needs_input"; message: string; intentType?: AssistantIntent["type"]; intent?: AssistantIntent }
  | { state: "unsupported"; message: string };

const monthNames: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeAssistantQuery(value: string) {
  return unaccent(normalize(value));
}

export function matchesAssistantQuery(label: string, query: string) {
  const normalizedLabel = normalizeAssistantQuery(label);
  const tokens = normalizeAssistantQuery(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => normalizedLabel.includes(token));
}

function unaccent(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function canonicalDate(year: number, month: number, day: number) {
  const value = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return isCanonicalAppointmentDate(value) ? value : null;
}

export function parseDateExpression(value: string, today: string) {
  const text = unaccent(value);
  if (text.includes("manana")) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return canonicalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (text.includes("hoy")) return isCanonicalAppointmentDate(today) ? today : null;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return canonicalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/.exec(text);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3]) : Number(today.slice(0, 4));
    return canonicalDate(year, Number(numeric[2]), Number(numeric[1]));
  }
  const named = /\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?\b/i.exec(value);
  if (named) return canonicalDate(Number(named[3] ?? today.slice(0, 4)), monthNames[unaccent(named[2])] ?? 0, Number(named[1]));
  return null;
}

export function parseTimeExpression(value: string) {
  const explicit = /(?:a\s+las?|las?|hora)\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\b/i.exec(value);
  const compact = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/i.exec(value);
  const match = explicit ?? compact;
  if (!match) return null;
  const hourValue = explicit ? match[1] : (match[4] ?? match[1]);
  const minuteValue = explicit ? match[2] : (match[2] ?? "0");
  let hour = Number(hourValue);
  const minute = Number(minuteValue ?? "0");
  const meridiem = (explicit ? match[3] : (match[3] ?? match[5]))?.toLowerCase();
  if (meridiem && (hour < 1 || hour > 12)) return null;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour <= 23 ? `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}` : null;
}

function cleanName(value: string) {
  return value.replace(/[.,!?]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

function extractPatient(value: string) {
  const match = /\bcon\s+(?!(?:la\s+)?(?:dra?\.?|dr\.?|doctor(?:a)?))(.+?)(?=\s+(?:con|y)\s+(?:(?:la|el)\s+)?(?:dra?\.?|dr\.?|doctor(?:a)?)\b|\s+(?:el|la)\s+\d|\s+\d{1,2}[/-]|\s+(?:hoy|mañana|manana|a\s+las?)\b|$)/i.exec(value);
  return match ? cleanName(match[1]) : undefined;
}

function extractProfessional(value: string) {
  const match = /\b(?:con|y|de|tiene)\s+(?:(?:la|el)\s+)?(?:dra?\.?|dr\.?|doctor(?:a)?)\s+(.+?)(?=\s+(?:el|la)\s+\d|\s+\d{1,2}[/-]|\s+(?:hoy|mañana|manana|a\s+las?)\b|$)/i.exec(value);
  return match ? cleanName(match[1]) : undefined;
}

function extractAppointmentQuery(value: string) {
  const uuid = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
  if (uuid && isCanonicalAppointmentUuid(uuid)) return uuid;
  const match = /^(?:.*?)(?:cita|appointment)\s*(.*)$/i.exec(value);
  return match?.[1]
    ?.replace(/\s+(?:para|el|la)\s+.*$/i, "")
    .replace(/\s+(?:hoy|mañana|manana|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?).*$/i, "")
    .replace(/^(?:de|del|para)\s+/i, "")
    .trim().slice(0, 100) || undefined;
}

function baseIntent(value: string, today: string): ParserResult {
  const normalized = normalize(value);
  const plain = unaccent(normalized);
  const durationMatch = /duraci[oó]n\s+(\d{1,3})/i.exec(normalized);
  const durationMinutes = durationMatch ? Number(durationMatch[1]) : 30;
  const localDate = parseDateExpression(normalized, today) ?? undefined;
  const localTime = parseTimeExpression(normalized) ?? undefined;

  if (/\b(?:agenda|agendar|crear)\b.*\bcita\b/i.test(plain)) {
    const intent: AssistantIntent = { type: "create_appointment", patientQuery: extractPatient(normalized), professionalQuery: extractProfessional(normalized), localDate, localTime, durationMinutes };
    if (plain.includes("por la tarde") || plain.includes("por la manana")) return { state: "needs_input", intentType: "create_appointment", intent, message: "¿A qué hora quieres agendarla?" };
    return { state: "intent", intent };
  }
  if (/\b(?:horarios?|disponibilidad)\b/i.test(plain)) {
    if (plain.includes("proximo") || plain.includes("por la tarde") || plain.includes("jueves")) return { state: "needs_input", intentType: "check_availability", message: "Necesito una fecha y hora más específicas." };
    const professionalQuery = extractProfessional(normalized) ?? (/(?:disponibilidad|horarios?).*(?:de|para)\s+/i.test(plain) ? cleanName(normalized.replace(/.*(?:de|para)\s+/i, "")) : undefined);
    return { state: "intent", intent: { type: "check_availability", professionalQuery, localDate, durationMinutes } };
  }
  if (/\b(?:reprograma|reprogramar|mueve|mover)\b.*\bcita\b/i.test(plain)) {
    return { state: "intent", intent: { type: "reschedule_appointment", appointmentQuery: extractAppointmentQuery(normalized), localDate, localTime, durationMinutes } };
  }
  if (/\b(?:cancela|cancelar|cita cancelada)\b/i.test(plain)) {
    return { state: "intent", intent: { type: "cancel_appointment", appointmentQuery: extractAppointmentQuery(normalized) } };
  }
  if (/\b(?:confirma|confirmar)\b.*\bcita\b/i.test(plain)) {
    return { state: "intent", intent: { type: "confirm_appointment", appointmentQuery: extractAppointmentQuery(normalized) } };
  }
  if (/\b(?:ver|qué|que|muestra|muéstrame|mostrar)\b.*\bcitas?\b/i.test(plain)) {
    return { state: "intent", intent: { type: "search_appointments", query: undefined, localDate } };
  }
  return { state: "unsupported", message: "Puedo ayudarte con citas, disponibilidad, confirmaciones, cancelaciones y reprogramaciones." };
}

export function parseAssistantText(value: string, today: string): ParserResult {
  const result = baseIntent(value, today);
  if (!value.trim()) return { state: "needs_input", message: "Escribe una solicitud para tu agenda." };
  return result;
}

export function isAssistantIntent(value: unknown): value is AssistantIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  return typeof intent.type === "string" && ["search_patients", "search_appointments", "check_availability", "create_appointment", "confirm_appointment", "cancel_appointment", "reschedule_appointment"].includes(intent.type)
    && (!("durationMinutes" in intent) || (typeof intent.durationMinutes === "number" && Number.isInteger(intent.durationMinutes) && intent.durationMinutes > 0 && intent.durationMinutes <= 240));
}
