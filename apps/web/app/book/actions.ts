"use server";

import { bookAppointment as book, loadAlternates as alternates, loadSlots as slots } from "@/lib/booking";

export async function loadSlots(serviceId: string, technicianId: string, date: string, locationSlug?: string) {
  return slots(serviceId, technicianId, date, locationSlug);
}

export async function loadAlternates(serviceId: string, date: string, locationSlug: string) {
  return alternates(serviceId, date, locationSlug);
}

export async function bookAppointment(input: {
  serviceId: string;
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
