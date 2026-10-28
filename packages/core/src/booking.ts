import { normalizePhone } from "./favorites";

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

export interface BookingFieldErrors {
  name?: string;
  phone?: string;
  email?: string;
  date?: string;
}

export function bookingFieldErrors(input: { name: string; phone: string; email: string; date: string; today: string }): BookingFieldErrors {
  const fields: BookingFieldErrors = {};
  if (input.name.trim().length < 2) fields.name = "Enter your name";
  if (normalizePhone(input.phone).length !== 10) fields.phone = "Enter a 10-digit phone number";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) fields.email = "Enter a valid email";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < input.today) fields.date = "Pick today or a later date";
  return fields;
}

export function resolveBookingIdentity(input: {
  signedIn: { id: string; name: string; email: string | null; phone: string | null } | null;
  entered: { name: string; email: string; phone: string };
}) {
  if (input.signedIn) {
    return {
      mode: "self" as const,
      clientId: input.signedIn.id,
      name: input.signedIn.name,
      email: (input.signedIn.email ?? "").trim().toLowerCase(),
      phone: (input.signedIn.phone ?? "").trim(),
    };
  }
  return {
    mode: "guest" as const,
    clientId: null,
    name: input.entered.name.trim(),
    email: input.entered.email.trim().toLowerCase(),
    phone: input.entered.phone.trim(),
  };
}

export function customerFacingAbout(about: string) {
  return about.replace(/\s*The address and hours are sample content\s*[—-]\s*change them in the owner portal\.?/gi, "").replace(/\s{2,}/g, " ").trim();
}

export function sortCustomerVisits<T extends { startAt: Date; status: string }>(visits: T[], now: Date) {
  const upcoming = (visit: T) => UPCOMING_VISIT_STATUSES.has(visit.status) && visit.startAt.getTime() >= now.getTime();
  return [...visits].sort((left, right) => {
    const leftUpcoming = upcoming(left);
    const rightUpcoming = upcoming(right);
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    return leftUpcoming ? left.startAt.getTime() - right.startAt.getTime() : right.startAt.getTime() - left.startAt.getTime();
  });
}
