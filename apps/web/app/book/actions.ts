"use server";

import { bookAppointment as book, loadAlternates as alternates, loadSlots as slots } from "@/lib/booking";

export async function loadSlots(serviceIds: string, technicianId: string, date: string, locationSlug?: string) {
  return slots(serviceIds, technicianId, date, locationSlug);
}

export async function loadAlternates(serviceIds: string, date: string, locationSlug: string) {
  return alternates(serviceIds, date, locationSlug);
}

export async function bookAppointment(input: {
  serviceIds: string[];
  technicianId: string;
  locationSlug: string;
  startIso: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}) {
  return book(input);
}
