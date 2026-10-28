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
