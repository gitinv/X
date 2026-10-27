import { effectiveOffer, formatWhen, listOpenSlots, rankAlternateLocations, zonedTimeToUtc, type AlternateLocation } from "@redlady/core";
import { createBooking, recordSms } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "./auth/session";
import { publicError } from "./errors";
import { dispatchSms } from "./sms";
import { LOCATION_COOKIE, getPublicTenant, weekdayIndex, type PublicSalon, type SalonLocation } from "./tenant";

const blocking = ["BOOKED", "CHECKED_IN", "IN_SERVICE"] as const;

async function offerFor(salon: PublicSalon, locationId: string, serviceId: string) {
  const service = await salon.db.service.findFirst({ where: { id: serviceId, tenantId: salon.id, active: true } });
  if (!service) return null;
  const override = await salon.db.serviceLocation.findUnique({
    where: { serviceId_locationId: { serviceId, locationId } },
  });
  const priced = effectiveOffer(service, override);
  if (!priced) return null;
  return { ...service, priceCents: priced.priceCents, durationMin: priced.durationMin };
}

export async function slotsAtLocation(salon: PublicSalon, location: SalonLocation, serviceId: string, technicianId: string | null, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const service = await offerFor(salon, location.id, serviceId);
  if (!service) return [];
  const technicians = await salon.db.technician.findMany({
    where: {
      tenantId: salon.id,
      active: true,
      ...(technicianId ? { id: technicianId } : {}),
      locations: { some: { locationId: location.id, active: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  const noon = zonedTimeToUtc(date, 12 * 60, location.timezone);
  const hours = location.hours.find((row) => row.dayOfWeek === weekdayIndex(date, location.timezone, noon));
  const dayStart = zonedTimeToUtc(date, 0, location.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const slots: { startIso: string; label: string; technicianId: string; technicianName: string }[] = [];
  for (const technician of technicians) {
    const busy = await salon.db.appointment.findMany({
      where: {
        tenantId: salon.id,
        technicianId: technician.id,
        status: { in: [...blocking] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
    });
    for (const slot of listOpenSlots({
      date,
      timeZone: location.timezone,
      openMin: hours?.openMin ?? 9 * 60,
      closeMin: hours?.closeMin ?? 19 * 60,
      closed: hours?.closed ?? false,
      durationMin: service.durationMin,
      busy: busy.map((appointment) => ({ start: appointment.startAt, end: appointment.endAt })),
      now: new Date(),
    })) {
      slots.push({
        startIso: slot.start.toISOString(),
        label: slot.label,
        technicianId: technician.id,
        technicianName: technician.name,
      });
    }
  }
  return slots;
}

export async function loadSlots(serviceId: string, technicianId: string, date: string, locationSlug?: string) {
  const salon = await getPublicTenant({ locationSlug });
  if (!salon) return [];
  const location = salon.locations.find((item) => item.slug === (locationSlug || salon.location.slug)) ?? salon.location;
  return slotsAtLocation(salon, location, serviceId, technicianId, date);
}

export async function loadAlternates(serviceId: string, date: string, locationSlug: string): Promise<AlternateLocation[]> {
  const salon = await getPublicTenant({ locationSlug });
  if (!salon) return [];
  const requested = salon.locations.find((item) => item.slug === locationSlug) ?? salon.location;
  const slotsByLocation: Record<string, { startIso: string; label: string; technicianId: string; technicianName: string }[]> = {};
  for (const location of salon.locations) {
    if (location.id === requested.id) continue;
    slotsByLocation[location.id] = (await slotsAtLocation(salon, location, serviceId, null, date)).slice(0, 3);
  }
  const origin = requested.latitude != null && requested.longitude != null ? { latitude: requested.latitude, longitude: requested.longitude } : null;
  return rankAlternateLocations({
    requestedLocationId: requested.id,
    origin,
    locations: salon.locations,
    slotsByLocation,
  });
}

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  technicianId: z.string().min(1),
  locationSlug: z.string().min(1),
  startIso: z.string().datetime(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().optional().or(z.literal("")),
  notes: z.string().trim().max(400).optional(),
});

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
  const salon = await getPublicTenant({ locationSlug: input.locationSlug });
  if (!salon) return { ok: false as const, error: "This salon is not ready for booking yet." };
  const location = salon.locations.find((item) => item.slug === input.locationSlug);
  if (!location) return { ok: false as const, error: "Choose a location." };
  const session = await getSession();
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the name and phone, then pick a time." };
  const service = await offerFor(salon, location.id, parsed.data.serviceId);
  const technician = await salon.db.technician.findFirst({
    where: { id: parsed.data.technicianId, tenantId: salon.id, active: true, locations: { some: { locationId: location.id, active: true } } },
  });
  if (!service || !technician) return { ok: false as const, error: "Choose a service and a technician at this location." };
  const start = new Date(parsed.data.startIso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  const slots = await slotsAtLocation(salon, location, service.id, technician.id, date);
  if (!slots.some((slot) => new Date(slot.startIso).getTime() === start.getTime())) {
    return { ok: false as const, error: "That time was just taken. Pick another." };
  }

  let clientId = session?.tenantId === salon.id ? session.clientId : null;
  if (!clientId) {
    const email = parsed.data.email || undefined;
    const existing = email
      ? await salon.db.client.findFirst({ where: { tenantId: salon.id, email } })
      : await salon.db.client.findFirst({ where: { tenantId: salon.id, phone: parsed.data.phone } });
    const client =
      existing ??
      (await salon.db.client.create({
        data: { tenantId: salon.id, name: parsed.data.name, phone: parsed.data.phone, email, lastLocationId: location.id },
      }));
    clientId = client.id;
  }
  await salon.db.client.update({ where: { id: clientId }, data: { lastLocationId: location.id } });

  try {
    const appointment = await createBooking(salon.db, {
      tenantId: salon.id,
      locationId: location.id,
      clientId,
      technicianId: technician.id,
      serviceId: service.id,
      startAt: start,
      endAt: new Date(start.getTime() + service.durationMin * 60_000),
      notes: parsed.data.notes,
    });
    const jar = await cookies();
    jar.set(LOCATION_COOKIE, location.slug, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
    const body = `${salon.name} (${location.name}): ${parsed.data.name}, you are booked for ${service.name} with ${technician.name} on ${formatWhen(start, location.timezone)}.`;
    try {
      const sent = await dispatchSms(parsed.data.phone, body);
      await recordSms(salon.db, { tenantId: salon.id, to: parsed.data.phone, body, provider: sent.name, providerId: sent.providerId });
    } catch (error) {
      await recordSms(salon.db, {
        tenantId: salon.id,
        to: parsed.data.phone,
        body,
        provider: "console",
        status: "FAILED",
        error: error instanceof Error ? error.message : "SMS failed",
      });
    }
    revalidatePath("/pos");
    revalidatePath("/tech");
    revalidatePath("/account");
    return { ok: true as const, when: formatWhen(appointment.startAt, location.timezone), service: service.name, technician: technician.name, location: location.name };
  } catch (error) {
    return { ok: false as const, error: publicError(error) };
  }
}
