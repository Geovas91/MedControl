export type AssistantTimeBound = { time: string; inclusive: boolean };
export type AssistantTimeFilter = { minimum?: AssistantTimeBound; maximum?: AssistantTimeBound };
export type ParsedAssistantTimeFilter = { state: "none" } | { state: "ambiguous" } | { state: "filter"; filter: AssistantTimeFilter };

const validTime = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function isValidAssistantTimeFilter(value: unknown): value is AssistantTimeFilter {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filter = value as Record<string, unknown>;
  if (Object.keys(filter).some((key) => key !== "minimum" && key !== "maximum") || !filter.minimum && !filter.maximum) return false;
  for (const key of ["minimum", "maximum"] as const) {
    if (filter[key] === undefined) continue;
    const bound = filter[key];
    if (!bound || typeof bound !== "object" || Array.isArray(bound)) return false;
    const row = bound as Record<string, unknown>;
    if (Object.keys(row).length !== 2 || !validTime(row.time) || typeof row.inclusive !== "boolean") return false;
  }
  const lower = (filter.minimum as AssistantTimeBound | undefined)?.time;
  const upper = (filter.maximum as AssistantTimeBound | undefined)?.time;
  return !lower || !upper || minutes(lower) < minutes(upper);
}

export function assistantTimeMatches(time: string, filter: AssistantTimeFilter) {
  if (!validTime(time) || !isValidAssistantTimeFilter(filter)) return false;
  const value = minutes(time);
  if (filter.minimum) {
    const minimum = minutes(filter.minimum.time);
    if (value < minimum || value === minimum && !filter.minimum.inclusive) return false;
  }
  if (filter.maximum) {
    const maximum = minutes(filter.maximum.time);
    if (value > maximum || value === maximum && !filter.maximum.inclusive) return false;
  }
  return true;
}

export function parseAssistantTimeFilter(message: string): ParsedAssistantTimeFilter {
  const text = message.normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const relative = /\b(a partir de|despues de|despues del|antes de|antes del)\s+(?:(?:las?|el)\s+)?(mediodia|\d{1,2}(?::\d{2})?)\s*(?:de la\s+(manana|tarde|noche)|\b(am|pm)\b)?/i.exec(text);
  if (!relative) {
    if (/\b(?:solo\s+)?(?:por\s+)?la manana\b/.test(text)) return { state: "filter", filter: { minimum: { time: "00:00", inclusive: true }, maximum: { time: "12:00", inclusive: false } } };
    if (/\b(?:solo\s+)?(?:por\s+)?la tarde\b/.test(text)) return { state: "filter", filter: { minimum: { time: "12:00", inclusive: true }, maximum: { time: "18:00", inclusive: false } } };
    return { state: "none" };
  }
  const direction = relative[1];
  let hour: number;
  let minute = 0;
  if (relative[2] === "mediodia") hour = 12;
  else {
    const parts = relative[2].split(":");
    hour = Number(parts[0]);
    minute = parts[1] === undefined ? 0 : Number(parts[1]);
    if (hour > 23 || minute > 59) return { state: "ambiguous" };
    const period = relative[3] ?? relative[4];
    if (period === "tarde" || period === "noche" || period === "pm") { if (hour < 1 || hour > 12) return { state: "ambiguous" }; if (hour < 12) hour += 12; }
    else if (period === "manana" || period === "am") { if (hour < 1 || hour > 12) return { state: "ambiguous" }; if (hour === 12) hour = 0; }
    else if (hour >= 1 && hour <= 11) return { state: "ambiguous" };
  }
  const bound = { time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, inclusive: direction === "a partir de" };
  return { state: "filter", filter: direction.startsWith("antes") ? { maximum: { ...bound, inclusive: false } } : { minimum: bound } };
}
