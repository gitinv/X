import { intervalsOverlap, type TimeRange } from "./booking";

export interface OpenSlot {
  start: Date;
  end: Date;
  label: string;
}

function zoneParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zoneParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

export function zonedTimeToUtc(date: string, minutes: number, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Date must be YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const desired = Date.UTC(year, month - 1, day, 0, minutes, 0);
  let utc = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = desired - zoneOffsetMs(new Date(utc), timeZone);
    if (Math.abs(next - utc) < 1) return new Date(next);
    utc = next;
  }
  return new Date(utc);
}

export function minutesInZone(instant: Date, timeZone: string): number {
  const parts = zoneParts(instant, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function zonedDayKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

export function formatWhen(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

export function listOpenSlots(input: {
  date: string;
  timeZone: string;
  openMin: number;
  closeMin: number;
  closed: boolean;
  durationMin: number;
  stepMin?: number;
  busy: TimeRange[];
  now?: Date;
}): OpenSlot[] {
  if (input.closed) return [];
  const step = input.stepMin ?? 30;
  const slots: OpenSlot[] = [];
  for (let minute = input.openMin; minute + input.durationMin <= input.closeMin; minute += step) {
    const start = zonedTimeToUtc(input.date, minute, input.timeZone);
    if (minutesInZone(start, input.timeZone) !== minute) continue;
    const end = new Date(start.getTime() + input.durationMin * 60_000);
    if (input.now && start.getTime() <= input.now.getTime()) continue;
    const overlapsBusy = input.busy.some((range) => intervalsOverlap({ start, end }, range));
    if (overlapsBusy) continue;
    slots.push({ start, end, label: formatTime(start, input.timeZone) });
  }
  return slots;
}
