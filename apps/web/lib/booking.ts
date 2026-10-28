import { assertSingleCoreServices, blockFitsShift, effectiveOffer, formatWhen, listOpenSlots, minutesInZone, rankAlternateLocations, reservedMinutes, zonedTimeToUtc, type AlternateLocation } from "@redlady/core";
import { createBooking, recordSms } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "./auth/session";
import { publicError } from "./errors";
import { dispatchSms } from "./sms";
import { LOCATION_COOKIE, getPublicTenant, weekdayIndex, type PublicSalon, type SalonLocation } from "./tenant";

async function offerFor(salon: PublicSalon, locationId: string, serviceId: string) {
  const service = await salon.db.service.findFirst({ where: { id: serviceId, tenantId: salon.id, active: true } });
  if (!service) return null;
  const override = await salon.db.serviceLocation.findUnique({
    where: { serviceId_locationId: { serviceId, locationId } },
  });
  const priced = effectiveOffer(service, override);
  if (!priced) return null;
  return { ...service, priceCents: priced.priceCents, durationMin: priced.durationMin, bufferMin: priced.bufferMin };
}

export async function slotsAtLocation(salon: PublicSalon, location: SalonLocation, serviceIds: string[], technicianId: string | null, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || serviceIds.length === 0) return [];
  const chosen = (await Promise.all(serviceIds.map((serviceId) => offerFor(salon, location.id, serviceId)))).filter((service) => service !== null);
  if (chosen.length !== serviceIds.length) return [];
  const durationMin = chosen.reduce((sum, service) => sum + reservedMinutes(service), 0);
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
  const dayOfWeek = weekdayIndex(date, location.timezone, noon);
  const shiftRows = technicians.length
    ? await salon.db.shift.findMany({
        where: { tenantId: salon.id, locationId: location.id, technicianId: { in: technicians.map((tech) => tech.id) } },
      })
    : [];
  const hours = location.hours.find((row) => row.dayOfWeek === dayOfWeek);
  const dayStart = zonedTimeToUtc(date, 0, location.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const slots: { startIso: string; label: string; technicianId: string; technicianName: string }[] = [];
  for (const technician of technicians) {
    const busy = await salon.db.appointment.findMany({
      where: {
        tenantId: salon.id,
        technicianId: technician.id,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
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
      durationMin,
      busy: busy.map((appointment) => ({ start: appointment.startAt, end: appointment.endAt })),
      now: new Date(),
    })) {
      const mine = shiftRows.filter((shift) => shift.technicianId === technician.id);
      const today = mine.filter((shift) => shift.active && shift.dayOfWeek === dayOfWeek);
      if (!blockFitsShift(minutesInZone(slot.start, location.timezone), durationMin, today, mine.length > 0)) continue;
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

export async function loadSlots(serviceIds: string, technicianId: string, date: string, locationSlug?: string) {
  const salon = await getPublicTenant({ locationSlug });
  if (!salon) return [];
  const location = salon.locations.find((item) => item.slug === (locationSlug || salon.location.slug)) ?? salon.location;
  const ids = serviceIds.split(",").map((id) => id.trim()).filter(Boolean);
  return slotsAtLocation(salon, location, ids, technicianId || null, date);
}

export async function loadAlternates(serviceIds: string, date: string, locationSlug: string): Promise<AlternateLocation[]> {
  const salon = await getPublicTenant({ locationSlug });
  if (!salon) return [];
  const requested = salon.locations.find((item) => item.slug === locationSlug) ?? salon.location;
  const slotsByLocation: Record<string, { startIso: string; label: string; technicianId: string; technicianName: string }[]> = {};
  for (const location of salon.locations) {
    if (location.id === requested.id) continue;
    const ids = serviceIds.split(",").map((id) => id.trim()).filter(Boolean);
    slotsByLocation[location.id] = (await slotsAtLocation(salon, location, ids, null, date)).slice(0, 3);
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
  serviceIds: z.array(z.string().min(1)).min(1),
  technicianId: z.string(),
  locationSlug: z.string().min(1),
  startIso: z.string().datetime(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().optional().or(z.literal("")),
  notes: z.string().trim().max(400).optional(),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export async function bookAppointment(input: {
  serviceIds: string[];
  technicianId: string;
  locationSlug: string;
  startIso: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  idempotencyKey?: string;
}) {
  const salon = await getPublicTenant({ locationSlug: input.locationSlug });
  if (!salon) return { ok: false as const, error: "This salon is not ready for booking yet." };
  const location = salon.locations.find((item) => item.slug === input.locationSlug);
  if (!location) return { ok: false as const, error: "Choose a location." };
  const session = await getSession();
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the name and phone, then pick a time." };
  const chosen = (await Promise.all(parsed.data.serviceIds.map((serviceId) => offerFor(salon, location.id, serviceId)))).filter((service) => service !== null);
  if (chosen.length !== parsed.data.serviceIds.length) return { ok: false as const, error: "Choose a service that this studio offers." };
  const core = assertSingleCoreServices(chosen);
  if (!core.ok) return { ok: false as const, error: core.reason };
  if (parsed.data.idempotencyKey) {
    const prior = await salon.db.appointment.findFirst({
      where: { tenantId: salon.id, idempotencyKey: parsed.data.idempotencyKey },
      include: { technician: true, location: true, lines: true, service: true },
    });
    if (prior) {
      const names = prior.lines.length ? prior.lines.map((line) => line.name).join(", ") : prior.service.name;
      return { ok: true as const, when: formatWhen(prior.startAt, prior.location.timezone), service: names, technician: prior.technician.name, location: prior.location.name };
    }
  }
  const start = new Date(parsed.data.startIso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  const open = await slotsAtLocation(salon, location, parsed.data.serviceIds, parsed.data.technicianId || null, date);
  const slot = open.find((item) => new Date(item.startIso).getTime() === start.getTime() && (!parsed.data.technicianId || item.technicianId === parsed.data.technicianId));
  if (!slot) return { ok: false as const, error: "That time is no longer available." };
  const technician = await salon.db.technician.findFirst({
    where: { id: slot.technicianId, tenantId: salon.id, active: true, locations: { some: { locationId: location.id, active: true } } },
  });
  if (!technician) return { ok: false as const, error: "Choose a technician at this location." };
  const service = chosen[0]!;

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
    const reserved = chosen.reduce((sum, item) => sum + reservedMinutes(item), 0);
    const requestedAt = Date.now();
    const appointment = await createBooking(salon.db, {
      tenantId: salon.id,
      locationId: location.id,
      clientId,
      technicianId: technician.id,
      serviceId: service.id,
      startAt: start,
      endAt: new Date(start.getTime() + reserved * 60_000),
      notes: parsed.data.notes,
      idempotencyKey: parsed.data.idempotencyKey,
      lines: chosen.map((item) => ({
        serviceId: item.id,
        name: item.name,
        kind: item.kind,
        priceCents: item.priceCents,
        durationMin: item.durationMin,
        bufferMin: item.bufferMin,
      })),
    });
    const jar = await cookies();
    jar.set(LOCATION_COOKIE, location.slug, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
    const names = chosen.map((item) => item.name).join(", ");
    const body = `${salon.name} (${location.name}): ${parsed.data.name}, you are booked for ${names} with ${technician.name} on ${formatWhen(start, location.timezone)}.`;
    const replay = appointment.createdAt.getTime() < requestedAt - 1500;
    if (replay) {
      const saved = await salon.db.appointment.findUnique({
        where: { id: appointment.id },
        include: { technician: true, location: true, lines: true, service: true },
      });
      if (saved) {
        const savedNames = saved.lines.length ? saved.lines.map((line) => line.name).join(", ") : saved.service.name;
        return { ok: true as const, when: formatWhen(saved.startAt, saved.location.timezone), service: savedNames, technician: saved.technician.name, location: saved.location.name };
      }
    }
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
    return { ok: true as const, when: formatWhen(appointment.startAt, location.timezone), service: names, technician: technician.name, location: location.name };
  } catch (error) {
    return { ok: false as const, error: publicError(error) };
  }
}
