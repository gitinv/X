import { assertSingleCoreServices, blockFitsShift, bookingFieldErrors, effectiveOffer, formatWhen, listOpenSlots, minutesInZone, rankAlternateLocations, reservedMinutes, resolveBookingIdentity, zonedDayKey, zonedTimeToUtc, type AlternateLocation, type BookingFieldErrors } from "@redlady/core";
import { createBooking, findClientByContact, recordSms } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getSession } from "./auth/session";
import { publicError } from "./errors";
import { signManageToken } from "./manage-token";
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
  return slots.sort((left, right) => left.startIso.localeCompare(right.startIso));
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
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
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
  if (!parsed.success) return { ok: false as const, error: "Check the visit details, then pick a time.", fields: {} as BookingFieldErrors };
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
      return {
        ok: true as const,
        reference: prior.reference ?? prior.id,
        when: formatWhen(prior.startAt, prior.location.timezone),
        service: names,
        technician: prior.technician.name,
        location: prior.location.name,
      };
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

  const today = zonedDayKey(new Date(), location.timezone);
  if (date < today) return { ok: false as const, error: "Pick today or a later date", fields: { date: "Pick today or a later date" } };
  const signedInClient =
    session?.tenantId === salon.id && session.clientId
      ? await salon.db.client.findFirst({ where: { id: session.clientId, tenantId: salon.id } })
      : null;
  const identity = resolveBookingIdentity({
    signedIn: signedInClient,
    entered: { name: parsed.data.name ?? "", email: parsed.data.email ?? "", phone: parsed.data.phone ?? "" },
  });
  if (identity.mode === "guest") {
    const fields = bookingFieldErrors({ name: identity.name, phone: identity.phone, email: identity.email, date, today });
    const first = fields.name || fields.phone || fields.email || fields.date;
    if (first) return { ok: false as const, error: first, fields };
  }
  let clientId = identity.clientId;
  if (!clientId) {
    const existing = await findClientByContact(salon.db, salon.id, identity.phone, identity.email);
    const client =
      existing ??
      (await salon.db.client.create({
        data: { tenantId: salon.id, name: identity.name, phone: identity.phone, email: identity.email || null, lastLocationId: location.id },
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
    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
    const proto = headerStore.get("x-forwarded-proto") || "https";
    let manageUrl = "";
    try {
      const token = await signManageToken({ appointmentId: appointment.id, tenantId: salon.id });
      manageUrl = `${proto}://${host}/book/manage/${token}`;
    } catch (error) {
      console.log(`[email:console] manage link skipped: ${error instanceof Error ? error.message : "unknown"}`);
    }
    const body = `${salon.name} (${location.name}): ${identity.name}, you are booked for ${names} with ${technician.name} on ${formatWhen(start, location.timezone)}.${manageUrl ? ` Manage or cancel: ${manageUrl}` : ""}`;
    if (identity.email) console.log(`[email:console] to=${identity.email} ${body}`);
    const replay = appointment.createdAt.getTime() < requestedAt - 1500;
    if (replay) {
      const saved = await salon.db.appointment.findUnique({
        where: { id: appointment.id },
        include: { technician: true, location: true, lines: true, service: true },
      });
      if (saved) {
        const savedNames = saved.lines.length ? saved.lines.map((line) => line.name).join(", ") : saved.service.name;
        return {
          ok: true as const,
          reference: saved.reference ?? saved.id,
          when: formatWhen(saved.startAt, saved.location.timezone),
          service: savedNames,
          technician: saved.technician.name,
          location: saved.location.name,
        };
      }
    }
    try {
      const sent = await dispatchSms(identity.phone, body);
      await recordSms(salon.db, { tenantId: salon.id, to: identity.phone, body, provider: sent.name, providerId: sent.providerId });
    } catch (error) {
      await recordSms(salon.db, {
        tenantId: salon.id,
        to: identity.phone,
        body,
        provider: "console",
        status: "FAILED",
        error: error instanceof Error ? error.message : "SMS failed",
      });
    }
    revalidatePath("/pos");
    revalidatePath("/tech");
    revalidatePath("/account");
    return {
      ok: true as const,
      reference: appointment.reference ?? appointment.id,
      when: formatWhen(appointment.startAt, location.timezone),
      service: names,
      technician: technician.name,
      location: location.name,
    };
  } catch (error) {
    return { ok: false as const, error: publicError(error) };
  }
}
