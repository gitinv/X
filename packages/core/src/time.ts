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

export function zonedDateTimeToUtc(value: string, timeZone: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (minutes >= 24 * 60) return null;
  return zonedTimeToUtc(match[1], minutes, timeZone);
}

export function formatDateTimeLocal(instant: Date, timeZone: string): string {
  const parts = zoneParts(instant, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  return `${parts.year}-${month}-${day}T${hour}:${minute}`;
}

export function nextDateKey(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Date must be YYYY-MM-DD.");
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
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

export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  const startLabel = formatTime(start, timeZone);
  const endLabel = formatTime(end, timeZone);
  const startMeridiem = startLabel.slice(-2);
  const endMeridiem = endLabel.slice(-2);
  if (startMeridiem === endMeridiem && (startMeridiem === "AM" || startMeridiem === "PM")) {
    return `${startLabel.slice(0, -3)}–${endLabel}`;
  }
  return `${startLabel}–${endLabel}`;
}

export function formatWallClock(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function weekdayOfDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return 0;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(dayOfWeek: number) {
  return WEEKDAYS[dayOfWeek] ?? "that day";
}

export function closedDaySentence(studio: string, dayOfWeek: number) {
  const name = weekdayName(dayOfWeek);
  return `${studio} is closed on ${name.endsWith("s") ? `${name}es` : `${name}s`}.`;
}

export function studioHoursSummary(hours: { dayOfWeek: number; openMin: number; closeMin: number; closed: boolean }[]) {
  return [...hours]
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek)
    .map((row) =>
      row.closed
        ? `${weekdayName(row.dayOfWeek).slice(0, 3)} closed`
        : `${weekdayName(row.dayOfWeek).slice(0, 3)} ${formatWallClock(row.openMin)}–${formatWallClock(row.closeMin)}`,
    )
    .join(" · ");
}

export function startFitsOpenWindow(startMin: number, durationMin: number, openMin: number, closeMin: number, closed: boolean) {
  if (closed || durationMin <= 0) return false;
  return startMin >= openMin && startMin + durationMin <= closeMin;
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
    slots.push({ start, end, label: formatTimeRange(start, end, input.timeZone) });
  }
  return slots;
}
