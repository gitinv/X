export const BLOCKING_APPOINTMENT_STATUSES = ["BOOKED", "CHECKED_IN", "IN_SERVICE"] as const;

export type BlockingStatus = (typeof BLOCKING_APPOINTMENT_STATUSES)[number];

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface BusyAppointment extends TimeRange {
  id: string;
  technicianId: string;
  status: string;
}

export function intervalsOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function blocksSchedule(status: string): boolean {
  return status !== "CANCELLED" && status !== "NO_SHOW";
}

export function findBookingConflict<T extends BusyAppointment>(
  existing: T[],
  candidate: TimeRange & { technicianId: string; ignoreId?: string },
): T | null {
  for (const appointment of existing) {
    if (appointment.id === candidate.ignoreId) continue;
    if (appointment.technicianId !== candidate.technicianId) continue;
    if (!blocksSchedule(appointment.status)) continue;
    if (intervalsOverlap(appointment, candidate)) return appointment;
  }
  return null;
}

export function canCustomerCancel(start: Date, now: Date, windowHours: number): boolean {
  if (windowHours < 0) return false;
  return start.getTime() - now.getTime() >= windowHours * 60 * 60 * 1000;
}

export const DEFAULT_CANCELLATION_WINDOW_HOURS = 24;
export const DEFAULT_LATE_CANCELLATION_POLICY = "Please call the studio.";

export function cancellationPolicyText(windowHours: number, latePolicy?: string | null) {
  const hours = Number.isFinite(windowHours) ? Math.max(0, Math.round(windowHours)) : DEFAULT_CANCELLATION_WINDOW_HOURS;
  const late = (latePolicy ?? "").trim() || DEFAULT_LATE_CANCELLATION_POLICY;
  const sentence = late.endsWith(".") ? late : `${late}.`;
  const after = `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  if (hours <= 0) return `Online cancellation is not free. ${sentence}`;
  const span = hours === 1 ? "1 hour" : `${hours} hours`;
  return `Free up to ${span} before the visit. After that, ${after}`;
}

const UPCOMING_VISIT_STATUSES = new Set(["BOOKED", "CHECKED_IN", "IN_SERVICE"]);

export function sortCustomerVisits<T extends { startAt: Date; status: string }>(visits: T[], now: Date) {
  const upcoming = (visit: T) => UPCOMING_VISIT_STATUSES.has(visit.status) && visit.startAt.getTime() >= now.getTime();
  return [...visits].sort((left, right) => {
    const leftUpcoming = upcoming(left);
    const rightUpcoming = upcoming(right);
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    return leftUpcoming ? left.startAt.getTime() - right.startAt.getTime() : right.startAt.getTime() - left.startAt.getTime();
  });
}
