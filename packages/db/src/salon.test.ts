import { afterAll, describe, expect, it } from "vitest";
import { InventoryError, assertSameTenant, canAccessLocation, canViewServicePhoto } from "@redlady/core";
import { getTenantClient, platform, urlForDatabase } from "./clients";
import { createPhysicalDatabase, migrateTenantUrl } from "./provision";
import { BookingConflictError, commitCheckout, createBooking, sendDueReminders } from "./salon";

const stamp = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
const created: { tenantId: string; dbName: string }[] = [];

async function makeSalon(slug: string) {
  const dbName = `t_${slug}_${stamp}`.replace(/[^a-z0-9_]/g, "").slice(0, 40);
  const admin = process.env.TENANT_ADMIN_URL || process.env.PLATFORM_DATABASE_URL;
  if (!admin) throw new Error("PLATFORM_DATABASE_URL is required.");
  await createPhysicalDatabase(dbName);
  const databaseUrl = urlForDatabase(admin, dbName);
  await migrateTenantUrl(databaseUrl);
  const tenant = await platform.tenant.create({
    data: {
      slug: `${slug}-${stamp}`,
      name: slug,
      status: "ACTIVE",
      dbName,
      dbHost: "localhost",
      databaseUrl,
    },
  });
  created.push({ tenantId: tenant.id, dbName });
  const db = getTenantClient(tenant.id, databaseUrl);
  await db.salonProfile.create({
    data: { tenantId: tenant.id, name: slug, tagline: "test", about: "test", phone: "555-0100", email: `${slug}@example.com`, address: "Test" },
  });
  const location = await db.location.create({
    data: { tenantId: tenant.id, slug: "main", name: "Main", address: "Test", phone: "555-0100", timezone: "UTC" },
  });
  const other = await db.location.create({
    data: { tenantId: tenant.id, slug: "other", name: "Other", address: "Other", phone: "555-0101", timezone: "UTC", latitude: 1, longitude: 1 },
  });
  const service = await db.service.create({
    data: { tenantId: tenant.id, category: "Mani Bar", name: "Gel manicure", description: "test", durationMin: 45, priceCents: 4500, supplies: ["LED lamp"] },
  });
  const technician = await db.technician.create({
    data: { tenantId: tenant.id, name: "Chloe", roleTitle: "Artist", specialties: ["Gel"] },
  });
  await db.technicianLocation.create({ data: { tenantId: tenant.id, technicianId: technician.id, locationId: location.id } });
  const client = await db.client.create({
    data: { tenantId: tenant.id, name: "Ava", phone: "555-0199", email: `ava-${slug}-${stamp}@example.com` },
  });
  const product = await db.product.create({
    data: { tenantId: tenant.id, name: "Cuticle oil", category: "CARE", description: "test", priceCents: 1050 },
  });
  await db.locationStock.create({
    data: { tenantId: tenant.id, locationId: location.id, productId: product.id, stock: 5, lowStockAlert: 2 },
  });
  return { tenant, db, location, other, service, technician, client, product };
}

describe("salon database rules", () => {
  it("keeps bookings inside one database and rejects a double-booked technician", async () => {
    const salonA = await makeSalon("red");
    const salonB = await makeSalon("lumen");
    const start = new Date("2026-08-01T15:00:00Z");
    const end = new Date("2026-08-01T15:45:00Z");
    const first = await createBooking(salonA.db, {
      tenantId: salonA.tenant.id,
      locationId: salonA.location.id,
      clientId: salonA.client.id,
      technicianId: salonA.technician.id,
      serviceId: salonA.service.id,
      startAt: start,
      endAt: end,
    });
    await expect(
      createBooking(salonA.db, {
        tenantId: salonA.tenant.id,
        locationId: salonA.location.id,
        clientId: salonA.client.id,
        technicianId: salonA.technician.id,
        serviceId: salonA.service.id,
        startAt: new Date("2026-08-01T15:15:00Z"),
        endAt: new Date("2026-08-01T16:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(BookingConflictError);

    const visibleToB = await salonB.db.appointment.findMany();
    const visibleToA = await salonA.db.appointment.findMany();
    expect(visibleToB).toEqual([]);
    expect(visibleToA.map((appointment) => appointment.id)).toEqual([first.id]);
    expect(() => assertSameTenant(salonB.tenant.id, salonA.tenant.id)).toThrow(/another salon/);
    expect(canAccessLocation({ role: "MANAGER", memberships: [{ locationId: salonA.location.id, role: "MANAGER" }], locationId: salonA.other.id })).toBe(false);
    expect(canAccessLocation({ role: "MANAGER", memberships: [{ locationId: salonA.location.id, role: "MANAGER" }], locationId: salonA.location.id })).toBe(true);
  });

  it("does not let a customer in one database see another salon's photos", async () => {
    const salonA = await makeSalon("photos");
    const salonB = await makeSalon("photosb");
    const visit = await createBooking(salonA.db, {
      tenantId: salonA.tenant.id,
      locationId: salonA.location.id,
      clientId: salonA.client.id,
      technicianId: salonA.technician.id,
      serviceId: salonA.service.id,
      startAt: new Date("2026-08-03T15:00:00Z"),
      endAt: new Date("2026-08-03T15:45:00Z"),
    });
    const photo = await salonA.db.servicePhoto.create({
      data: {
        tenantId: salonA.tenant.id,
        clientId: salonA.client.id,
        appointmentId: visit.id,
        serviceId: salonA.service.id,
        label: "AFTER",
        uploadedById: "staff",
        originalKey: "a",
        displayKey: "b",
        thumbKey: "c",
        sha256: "abc",
        contentType: "image/jpeg",
      },
    });
    expect(await salonB.db.servicePhoto.findUnique({ where: { id: photo.id } })).toBeNull();
    expect(canViewServicePhoto({ role: "CUSTOMER", tenantId: salonA.tenant.id, clientId: salonA.client.id }, photo)).toBe(true);
    expect(canViewServicePhoto({ role: "CUSTOMER", tenantId: salonB.tenant.id, clientId: salonA.client.id }, photo)).toBe(false);
  });

  it("decrements the location's stock and refuses another location's product", async () => {
    const salon = await makeSalon("checkout");
    const appointment = await createBooking(salon.db, {
      tenantId: salon.tenant.id,
      locationId: salon.location.id,
      clientId: salon.client.id,
      technicianId: salon.technician.id,
      serviceId: salon.service.id,
      startAt: new Date("2026-08-02T15:00:00Z"),
      endAt: new Date("2026-08-02T15:45:00Z"),
    });
    const order = await commitCheckout(salon.db, {
      tenantId: salon.tenant.id,
      locationId: salon.location.id,
      appointmentId: appointment.id,
      paymentMethod: "CARD",
      products: [{ productId: salon.product.id, quantity: 2 }],
    });
    const stock = await salon.db.locationStock.findUniqueOrThrow({
      where: { locationId_productId: { locationId: salon.location.id, productId: salon.product.id } },
    });
    const paid = await salon.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(order.totalCents).toBe(4500 + 1050 * 2);
    expect(stock.stock).toBe(3);
    expect(paid.status).toBe("COMPLETED");
    expect(paid.paymentStatus).toBe("PAID");
    await salon.db.serviceLocation.create({
      data: {
        tenantId: salon.tenant.id,
        serviceId: salon.service.id,
        locationId: salon.location.id,
        available: true,
        priceCents: 5000,
        durationMin: 50,
      },
    });
    const overridden = await createBooking(salon.db, {
      tenantId: salon.tenant.id,
      locationId: salon.location.id,
      clientId: salon.client.id,
      technicianId: salon.technician.id,
      serviceId: salon.service.id,
      startAt: new Date("2026-08-02T17:00:00Z"),
      endAt: new Date("2026-08-02T17:50:00Z"),
    });
    const locationPrice = await commitCheckout(salon.db, {
      tenantId: salon.tenant.id,
      locationId: salon.location.id,
      appointmentId: overridden.id,
      paymentMethod: "CARD",
      products: [],
    });
    expect(locationPrice.totalCents).toBe(5000);
    await expect(
      commitCheckout(salon.db, {
        tenantId: salon.tenant.id,
        locationId: salon.other.id,
        paymentMethod: "CASH",
        products: [{ productId: salon.product.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(InventoryError);
  });

  it("sends a day-ahead reminder once", async () => {
    const salon = await makeSalon("remind");
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const appointment = await createBooking(salon.db, {
      tenantId: salon.tenant.id,
      locationId: salon.location.id,
      clientId: salon.client.id,
      technicianId: salon.technician.id,
      serviceId: salon.service.id,
      startAt: start,
      endAt: new Date(start.getTime() + 45 * 60 * 1000),
    });
    const driver = { name: "console", send: async () => ({ providerId: "test-sms" }) };
    const first = await sendDueReminders(salon.db, driver, { leadHoursMin: 20, leadHoursMax: 28 });
    const second = await sendDueReminders(salon.db, driver, { leadHoursMin: 20, leadHoursMax: 28 });
    const messages = await salon.db.smsMessage.findMany({ where: { tenantId: salon.tenant.id } });
    expect(first).toEqual([appointment.id]);
    expect(second).toEqual([]);
    expect(messages).toHaveLength(1);
  });
});

afterAll(async () => {
  const { default: pg } = await import("pg");
  for (const entry of created.reverse()) {
    const tenant = await platform.tenant.findUnique({ where: { id: entry.tenantId } });
    if (tenant?.databaseUrl) {
      const client = getTenantClient(entry.tenantId, tenant.databaseUrl);
      await client.$disconnect();
    }
    await platform.tenant.delete({ where: { id: entry.tenantId } }).catch(() => undefined);
  }
  const admin = process.env.TENANT_ADMIN_URL || process.env.PLATFORM_DATABASE_URL;
  if (admin) {
    const client = new pg.Client({ connectionString: admin });
    await client.connect();
    try {
      for (const entry of created) {
        await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [entry.dbName]);
        await client.query(`DROP DATABASE IF EXISTS ${entry.dbName}`);
      }
    } finally {
      await client.end();
    }
  }
  await platform.$disconnect();
});
