export type AvailabilityInterval = { start: string; end: string };
export type AvailabilityWeek = Record<number, AvailabilityInterval[]>;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_LABELS: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo" };

export function validateAvailabilityWeek(week: AvailabilityWeek): string | null {
  for (const day of WEEKDAYS) {
    const intervals = week[day] ?? [];
    const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
    for (const item of sorted) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end)) return `${WEEKDAY_LABELS[day]}: hora inválida.`;
      if (item.start >= item.end) return `${WEEKDAY_LABELS[day]}: la hora inicial debe ser menor que la final.`;
    }
    for (let i = 1; i < sorted.length; i += 1) if (sorted[i - 1].end > sorted[i].start) return `${WEEKDAY_LABELS[day]}: los intervalos no pueden traslaparse.`;
  }
  return null;
}
