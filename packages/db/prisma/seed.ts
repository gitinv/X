import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { ProductCategory } from "../src/generated/tenant";
import { getTenantClient, platform, urlForDatabase } from "../src/clients";
import { createPhysicalDatabase, migrateTenantUrl, resolveTenantUrl } from "../src/provision";
import { clearTenantDatabase } from "../src/salon";

const services: {
  category: string;
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  supplies: string[];
  sortOrder: number;
}[] = [
  {
    category: "Mani Bar",
    name: "The Red Lady Classic Manicure",
    description: "Vitamin soak, shaping, cuticle care, a short massage, hot towels, and regular polish.",
    durationMin: 30,
    priceCents: 2500,
    supplies: ["Finger bowl", "Cuticle nipper", "Lotion", "Regular polish"],
    sortOrder: 10,
  },
  {
    category: "Mani Bar",
    name: "The Red Lady Deluxe Manicure",
    description: "Spa scrub, hydration mask, paraffin wrap, and a longer massage.",
    durationMin: 45,
    priceCents: 3500,
    supplies: ["Sugar scrub", "Paraffin", "Hot towels", "Massage lotion"],
    sortOrder: 20,
  },
  {
    category: "Mani Bar",
    name: "Gel (Shellac) Manicure",
    description: "Long-wear gel color, cured under the LED lamp, with cuticle oil to finish.",
    durationMin: 45,
    priceCents: 4500,
    supplies: ["LED lamp", "Gel polish", "Lint-free wipes", "Cuticle oil", "Buffer"],
    sortOrder: 30,
  },
  {
    category: "Mani Bar",
    name: "Collagen Spa Manicure",
    description: "Collagen gloves, hot oil, and a neck-and-shoulder release.",
    durationMin: 50,
    priceCents: 5500,
    supplies: ["Collagen gloves", "Hot oil", "Massage lotion"],
    sortOrder: 40,
  },
  {
    category: "Pedi Bar",
    name: "The Red Lady Classic Pedicure",
    description: "Warm soak, shaping, gentle exfoliation, massage, and color.",
    durationMin: 45,
    priceCents: 3500,
    supplies: ["Foot bath liner", "Callus softener", "Hot towels", "Polish"],
    sortOrder: 50,
  },
  {
    category: "Pedi Bar",
    name: "Organic Lavender Pedicure",
    description: "Lavender salt scrub, a mask, and a hot-stone massage.",
    durationMin: 60,
    priceCents: 4500,
    supplies: ["Lavender salt", "Foot mask", "Hot stones", "Hot towels", "Massage lotion"],
    sortOrder: 60,
  },
  {
    category: "Pedi Bar",
    name: "The Red Lady Signature Detox Pedicure",
    description: "Collagen mask, hot stones, and a paraffin finish.",
    durationMin: 75,
    priceCents: 7000,
    supplies: ["Collagen foot mask", "Hot stones", "Paraffin", "Callus softener", "Botanical scrub"],
    sortOrder: 70,
  },
  {
    category: "Nails Bar",
    name: "Acrylic Full Set",
    description: "A full set of extensions shaped and finished in the color you choose.",
    durationMin: 75,
    priceCents: 5000,
    supplies: ["Acrylic liquid", "Acrylic powder", "Nail tips", "Dappen dish", "E-file"],
    sortOrder: 80,
  },
  {
    category: "Nails Bar",
    name: "Dipping Powder (Dip Nails)",
    description: "A lightweight color powder set, sealed with activator and top coat.",
    durationMin: 60,
    priceCents: 5000,
    supplies: ["Dip powder", "Dip base", "Activator", "Top coat", "Buffer"],
    sortOrder: 90,
  },
  {
    category: "Nails Bar",
    name: "Midnight Velvet Spark",
    description: "Aria Thorne's velvet gel, placed crystals, and a paraffin finish.",
    durationMin: 100,
    priceCents: 14500,
    supplies: ["Velvet gel", "Crystals", "Paraffin", "Cuticle oil", "LED lamp"],
    sortOrder: 100,
  },
  {
    category: "Add Aura",
    name: "Gel Polish Change",
    description: "Soak-off and a fresh gel color.",
    durationMin: 25,
    priceCents: 2500,
    supplies: ["Gel polish", "LED lamp", "Foil wraps", "Cuticle oil"],
    sortOrder: 110,
  },
  {
    category: "Add Aura",
    name: "Paraffin Treatment",
    description: "Warm paraffin mittens or booties after a service.",
    durationMin: 15,
    priceCents: 1200,
    supplies: ["Paraffin wax", "Mittens or booties"],
    sortOrder: 120,
  },
];

const products: {
  name: string;
  category: ProductCategory;
  description: string;
  priceCents: number;
  stock: number;
  lowStockAlert: number;
  imageUrl: string;
}[] = [
  {
    name: "Aurora Velvet Chrome Polish",
    category: "POLISH",
    description: "Magnetic pigment that shifts color under the salon wand.",
    priceCents: 1800,
    stock: 45,
    lowStockAlert: 10,
    imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80",
  },
  {
    name: "Japanese Pastels Soft-gel Set",
    category: "ART",
    description: "High-opacity pastel gels used by the studio trainers.",
    priceCents: 2450,
    stock: 8,
    lowStockAlert: 12,
    imageUrl: "https://images.unsplash.com/photo-1632345031435-8797b2d58045?w=800&q=80",
  },
  {
    name: "Organic Shea Butter Hand Mask",
    category: "CARE",
    description: "A paraben-free mask for dry hands.",
    priceCents: 1500,
    stock: 30,
    lowStockAlert: 8,
    imageUrl: "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?w=800&q=80",
  },
  {
    name: "Japanese Precision Glass File",
    category: "TOOLS",
    description: "Seals the nail edge so it is less likely to peel.",
    priceCents: 1200,
    stock: 14,
    lowStockAlert: 5,
    imageUrl: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80",
  },
  {
    name: "Midnight Eclipse Caviar Charms",
    category: "ART",
    description: "Tiny metallic beads for galaxy nail art.",
    priceCents: 900,
    stock: 3,
    lowStockAlert: 10,
    imageUrl: "https://images.unsplash.com/photo-1595853035070-59a39fe84de3?w=800&q=80",
  },
  {
    name: "Vitamin E Nourishing Cuticle Oil",
    category: "CARE",
    description: "Almond and jojoba oil with vitamin E.",
    priceCents: 1050,
    stock: 50,
    lowStockAlert: 15,
    imageUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=800&q=80",
  },
];

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

function weekHours(tenantId: string, locationId: string, sunday: { closed: boolean; openMin: number; closeMin: number }, weekday: { openMin: number; closeMin: number }) {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    tenantId,
    locationId,
    dayOfWeek: day,
    closed: day === 0 ? sunday.closed : false,
    openMin: day === 0 ? sunday.openMin : weekday.openMin,
    closeMin: day === 0 ? sunday.closeMin : weekday.closeMin,
  }));
}

async function ensureTenant(input: {
  slug: string;
  name: string;
  dbName: string;
  subscriptionStatus: "TRIAL" | "ACTIVE";
  includedLocations: number;
}) {
  const admin = process.env.TENANT_ADMIN_URL || process.env.PLATFORM_DATABASE_URL;
  if (!admin) throw new Error("Set PLATFORM_DATABASE_URL in .env.");
  await createPhysicalDatabase(input.dbName);
  const databaseUrl = urlForDatabase(admin, input.dbName);
  const existing = await platform.tenant.findUnique({ where: { slug: input.slug } });
  const row = existing
    ? await platform.tenant.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          status: "ACTIVE",
          subscriptionStatus: input.subscriptionStatus,
          dbName: input.dbName,
          dbHost: new URL(databaseUrl).hostname,
          databaseUrl,
          connectionSecretArn: null,
          includedLocations: input.includedLocations,
          extraLocationPriceCents: 4900,
        },
      })
    : await platform.tenant.create({
        data: {
          slug: input.slug,
          name: input.name,
          status: "ACTIVE",
          subscriptionStatus: input.subscriptionStatus,
          dbName: input.dbName,
          dbHost: new URL(databaseUrl).hostname,
          databaseUrl,
          includedLocations: input.includedLocations,
          extraLocationPriceCents: 4900,
        },
      });
  const url = await resolveTenantUrl(row);
  await migrateTenantUrl(url);
  const db = getTenantClient(row.id, url);
  await clearTenantDatabase(db);
  return { row, db };
}

async function main() {
  const password = async (plain: string) => bcrypt.hash(plain, 8);
  await platform.platformUser.upsert({
    where: { email: "platform@redladyspa.com" },
    update: { name: "Platform Admin", passwordHash: await password("Demo-Platform-2026") },
    create: { email: "platform@redladyspa.com", name: "Platform Admin", passwordHash: await password("Demo-Platform-2026") },
  });

  const red = await ensureTenant({
    slug: "red-lady-spa",
    name: "The Red Lady Spa",
    dbName: "redladyspa",
    subscriptionStatus: "TRIAL",
    includedLocations: 1,
  });
  const db = red.db;
  const tenantId = red.row.id;
  await db.salonProfile.create({
    data: {
      tenantId,
      name: "The Red Lady Spa",
      tagline: "Sculpting luxury at your fingertips",
      about:
        "Medical-grade Russian manicures, hand-painted gel, and restorative paraffin care. Two Chicago studios share one client book. The address and hours are sample content — change them in the owner portal.",
      phone: "(312) 555-0148",
      email: "hello@redladyspa.com",
      address: "18 East Oak Street, Chicago, IL",
      brandColor: "#7A1F2B",
      accentColor: "#C4A484",
      timezone: "America/Chicago",
      cancellationWindowHours: 2,
      photoConsentRequired: true,
    },
  });
  const oak = await db.location.create({
    data: {
      tenantId,
      slug: "oak-street",
      name: "Oak Street",
      address: "18 East Oak Street, Chicago, IL",
      phone: "(312) 555-0148",
      email: "oak@redladyspa.com",
      timezone: "America/Chicago",
      latitude: 41.9004,
      longitude: -87.6244,
      subdomain: "oak",
      sortOrder: 1,
    },
  });
  const lincoln = await db.location.create({
    data: {
      tenantId,
      slug: "lincoln-park",
      name: "Lincoln Park",
      address: "2300 N Lincoln Avenue, Chicago, IL",
      phone: "(312) 555-0190",
      email: "lincoln@redladyspa.com",
      timezone: "America/Chicago",
      latitude: 41.9234,
      longitude: -87.6493,
      subdomain: "lincoln",
      sortOrder: 2,
    },
  });
  await db.businessHour.createMany({
    data: [
      ...weekHours(tenantId, oak.id, { closed: false, openMin: 10 * 60, closeMin: 17 * 60 }, { openMin: 9 * 60, closeMin: 19 * 60 }),
      ...weekHours(tenantId, lincoln.id, { closed: true, openMin: 10 * 60, closeMin: 17 * 60 }, { openMin: 10 * 60, closeMin: 19 * 60 }),
    ],
  });
  await db.register.createMany({
    data: [
      { tenantId, locationId: oak.id, name: "Oak front desk" },
      { tenantId, locationId: lincoln.id, name: "Lincoln front desk" },
    ],
  });
  await db.service.createMany({ data: services.map((service) => ({ ...service, tenantId })) });
  const menu = await db.service.findMany({ where: { tenantId } });
  const byName = (name: string) => menu.find((service) => service.name === name)!;
  const gel = byName("Gel (Shellac) Manicure");
  await db.serviceLocation.create({
    data: { tenantId, serviceId: gel.id, locationId: lincoln.id, available: true, priceCents: 5000, durationMin: 50 },
  });
  await db.serviceLocation.create({
    data: { tenantId, serviceId: byName("Midnight Velvet Spark").id, locationId: lincoln.id, available: false },
  });
  for (const product of products) {
    const created = await db.product.create({
      data: {
        tenantId,
        name: product.name,
        category: product.category,
        description: product.description,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl,
      },
    });
    await db.locationStock.createMany({
      data: [
        { tenantId, locationId: oak.id, productId: created.id, stock: product.stock, lowStockAlert: product.lowStockAlert },
        {
          tenantId,
          locationId: lincoln.id,
          productId: created.id,
          stock: Math.max(1, Math.floor(product.stock / 2)),
          lowStockAlert: product.lowStockAlert,
        },
      ],
    });
  }
  const chloe = await db.technician.create({
    data: {
      tenantId,
      name: "Chloe Kim",
      roleTitle: "Nail art",
      specialties: ["3D gel", "Cat-eye", "Hand-painted line"],
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80",
      sortOrder: 1,
    },
  });
  const sophia = await db.technician.create({
    data: {
      tenantId,
      name: "Sophia Martinez",
      roleTitle: "Sculpting",
      specialties: ["Structure gel", "Acrylic", "Russian manicure"],
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
      sortOrder: 2,
    },
  });
  const marcus = await db.technician.create({
    data: {
      tenantId,
      name: "Marcus Chen",
      roleTitle: "Minimal",
      specialties: ["Linework", "Matte overlay", "Chrome"],
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
      sortOrder: 3,
    },
  });
  const yuki = await db.technician.create({
    data: {
      tenantId,
      name: "Yuki Tanaka",
      roleTitle: "Japanese art",
      specialties: ["Pastels", "Jelly flowers", "Foil"],
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80",
      sortOrder: 4,
    },
  });
  await db.technicianLocation.createMany({
    data: [
      { tenantId, technicianId: chloe.id, locationId: oak.id },
      { tenantId, technicianId: chloe.id, locationId: lincoln.id },
      { tenantId, technicianId: sophia.id, locationId: oak.id },
      { tenantId, technicianId: marcus.id, locationId: lincoln.id },
      { tenantId, technicianId: yuki.id, locationId: oak.id },
      { tenantId, technicianId: yuki.id, locationId: lincoln.id },
    ],
  });
  const eleanor = await db.client.create({
    data: {
      tenantId,
      name: "Eleanor Vance",
      phone: "555-0144",
      email: "eleanor@example.com",
      notes: "Prefers round tips and deep green.",
      photoConsentAt: new Date(),
      lastLocationId: oak.id,
    },
  });
  const gemma = await db.client.create({
    data: {
      tenantId,
      name: "Gemma Ward",
      phone: "415-555-0199",
      email: "gemma.ward@example.com",
      notes: "Delicate cuticles. Japanese gels only. Has not agreed to service photos.",
      lastLocationId: oak.id,
    },
  });
  const ava = await db.client.create({
    data: {
      tenantId,
      name: "Ava Chen",
      phone: "312-555-0177",
      email: "ava@redladyspa.com",
      notes: "Demo customer login.",
      photoConsentAt: new Date(),
      lastLocationId: oak.id,
    },
  });
  const noah = await db.client.create({
    data: { tenantId, name: "Noah Blake", phone: "312-555-0160", email: "noah@example.com", lastLocationId: lincoln.id },
  });
  const priya = await db.client.create({
    data: { tenantId, name: "Priya Shah", phone: "312-555-0188", email: "priya@example.com", photoConsentAt: new Date(), lastLocationId: lincoln.id },
  });
  const avaUser = await db.user.create({
    data: {
      email: "ava@redladyspa.com",
      name: "Ava Chen",
      role: "CUSTOMER",
      phone: "312-555-0177",
      passwordHash: await password("Demo-Customer-2026"),
      tenantId,
      clientId: ava.id,
    },
  });
  await db.user.create({
    data: {
      email: "chloe@redladyspa.com",
      name: "Chloe Kim",
      role: "TECHNICIAN",
      passwordHash: await password("Demo-Tech-2026"),
      tenantId,
      technicianId: chloe.id,
      assignments: {
        create: [
          { tenantId, locationId: oak.id, role: "TECHNICIAN" },
          { tenantId, locationId: lincoln.id, role: "TECHNICIAN" },
        ],
      },
    },
  });
  await db.user.create({
    data: {
      email: "desk@redladyspa.com",
      name: "Front Desk",
      role: "FRONT_DESK",
      passwordHash: await password("Demo-Desk-2026"),
      tenantId,
      assignments: {
        create: [
          { tenantId, locationId: oak.id, role: "FRONT_DESK" },
          { tenantId, locationId: lincoln.id, role: "FRONT_DESK" },
        ],
      },
    },
  });
  await db.user.create({
    data: {
      email: "manager@redladyspa.com",
      name: "Nora Hale",
      role: "MANAGER",
      passwordHash: await password("Demo-Manager-2026"),
      tenantId,
      assignments: { create: [{ tenantId, locationId: oak.id, role: "MANAGER" }] },
    },
  });
  await db.user.create({
    data: {
      email: "owner@redladyspa.com",
      name: "Red Lady Owner",
      role: "OWNER",
      passwordHash: await password("Demo-Owner-2026"),
      tenantId,
    },
  });
  const now = Date.now();
  const lavender = byName("Organic Lavender Pedicure");
  const dip = byName("Dipping Powder (Dip Nails)");
  const classic = byName("The Red Lady Classic Manicure");
  const velvet = byName("Midnight Velvet Spark");
  const change = byName("Gel Polish Change");
  const past = await db.appointment.create({
    data: {
      tenantId,
      locationId: oak.id,
      clientId: ava.id,
      technicianId: chloe.id,
      serviceId: classic.id,
      startAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      endAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + classic.durationMin * 60 * 1000),
      status: "COMPLETED",
      paymentStatus: "PAID",
    },
  });
  const velvetVisit = await db.appointment.create({
    data: {
      tenantId,
      locationId: oak.id,
      clientId: eleanor.id,
      technicianId: yuki.id,
      serviceId: velvet.id,
      startAt: new Date(now - 5 * 60 * 60 * 1000),
      endAt: new Date(now - 5 * 60 * 60 * 1000 + velvet.durationMin * 60 * 1000),
      status: "COMPLETED",
      paymentStatus: "PAID",
    },
  });
  await db.appointment.createMany({
    data: [
      {
        tenantId,
        locationId: oak.id,
        clientId: eleanor.id,
        technicianId: chloe.id,
        serviceId: gel.id,
        startAt: new Date(now - 20 * 60 * 1000),
        endAt: new Date(now - 20 * 60 * 1000 + gel.durationMin * 60 * 1000),
        status: "IN_SERVICE",
        paymentStatus: "UNPAID",
      },
      {
        tenantId,
        locationId: oak.id,
        clientId: gemma.id,
        technicianId: sophia.id,
        serviceId: lavender.id,
        startAt: new Date(now + 35 * 60 * 1000),
        endAt: new Date(now + 35 * 60 * 1000 + lavender.durationMin * 60 * 1000),
        status: "CHECKED_IN",
        paymentStatus: "UNPAID",
      },
      {
        tenantId,
        locationId: lincoln.id,
        clientId: noah.id,
        technicianId: marcus.id,
        serviceId: dip.id,
        startAt: new Date(now + 95 * 60 * 1000),
        endAt: new Date(now + 95 * 60 * 1000 + dip.durationMin * 60 * 1000),
        status: "BOOKED",
        paymentStatus: "UNPAID",
        notes: "First visit. Wants a short square.",
      },
      {
        tenantId,
        locationId: oak.id,
        clientId: ava.id,
        technicianId: chloe.id,
        serviceId: classic.id,
        startAt: new Date(now + 24 * 60 * 60 * 1000),
        endAt: new Date(now + 24 * 60 * 60 * 1000 + classic.durationMin * 60 * 1000),
        status: "BOOKED",
        paymentStatus: "UNPAID",
      },
      {
        tenantId,
        locationId: lincoln.id,
        clientId: priya.id,
        technicianId: yuki.id,
        serviceId: change.id,
        startAt: new Date(now - 5 * 60 * 1000),
        endAt: new Date(now - 5 * 60 * 1000 + change.durationMin * 60 * 1000),
        status: "CHECKED_IN",
        paymentStatus: "UNPAID",
      },
    ],
  });
  await db.order.create({
    data: {
      tenantId,
      locationId: oak.id,
      appointmentId: velvetVisit.id,
      clientId: eleanor.id,
      status: "PAID",
      paymentMethod: "CARD",
      totalCents: velvet.priceCents,
      items: { create: [{ kind: "SERVICE", name: velvet.name, quantity: 1, unitCents: velvet.priceCents }] },
    },
  });
  const photoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/photos");
  const originalKey = `tenants/${tenantId}/customers/${ava.id}/appointments/${past.id}/seed-original.jpg`;
  const displayKey = `tenants/${tenantId}/customers/${ava.id}/appointments/${past.id}/seed-display.jpg`;
  const thumbKey = `tenants/${tenantId}/customers/${ava.id}/appointments/${past.id}/seed-thumb.jpg`;
  for (const key of [originalKey, displayKey, thumbKey]) {
    const file = path.join(photoDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, jpeg);
  }
  const uploader = avaUser.id;
  await db.servicePhoto.create({
    data: {
      tenantId,
      clientId: ava.id,
      appointmentId: past.id,
      serviceId: classic.id,
      label: "AFTER",
      note: "Sample photo stored on the local disk.",
      uploadedById: uploader,
      originalKey,
      displayKey,
      thumbKey,
      sha256: createHash("sha256").update(jpeg).digest("hex"),
      contentType: "image/jpeg",
    },
  });
  await db.campaign.create({
    data: {
      tenantId,
      title: "Midnight Velvet Spark",
      influencer: "Aria Thorne (@aria_nails)",
      description: "Shifting velvet gel, charcoal crystals, and a wildrose paraffin bath.",
      priceCents: 14500,
      imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80",
      active: true,
    },
  });
  await db.trend.createMany({
    data: [
      {
        tenantId,
        rank: 1,
        title: "Magnetic Velvet Cat-Eye",
        description: "A deep rose or emerald shift that looks brushed, not glittered.",
        imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80",
      },
      {
        tenantId,
        rank: 2,
        title: "Aurora Glass Chrome",
        description: "A clean neutral base with a mirror chrome veil.",
        imageUrl: "https://images.unsplash.com/photo-1632345031435-8797b2d58045?w=800&q=80",
      },
      {
        tenantId,
        rank: 3,
        title: "3D Jelly Flowers",
        description: "Raised translucent petals in builder gel.",
        imageUrl: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80",
      },
    ],
  });
  await db.smsMessage.create({
    data: {
      tenantId,
      to: "312-555-0177",
      body: "The Red Lady Spa (Oak Street): Ava, you are booked for The Red Lady Classic Manicure tomorrow. This is a sample message from the console SMS driver.",
      status: "SENT",
      provider: "console",
      providerId: "seed-console",
    },
  });

  const lumen = await ensureTenant({
    slug: "lumen-nails",
    name: "Lumen Nails",
    dbName: "tenant_lumen_nails",
    subscriptionStatus: "ACTIVE",
    includedLocations: 1,
  });
  const lumenId = lumen.row.id;
  await lumen.db.salonProfile.create({
    data: {
      tenantId: lumenId,
      name: "Lumen Nails",
      tagline: "A second sample salon",
      about: "Used to show that one salon cannot see another's book.",
      phone: "(206) 555-0110",
      email: "hello@lumennails.example",
      address: "Seattle, WA",
      brandColor: "#1F4E5A",
      timezone: "America/Los_Angeles",
      photoConsentRequired: true,
    },
  });
  const capitol = await lumen.db.location.create({
    data: {
      tenantId: lumenId,
      slug: "capitol-hill",
      name: "Capitol Hill",
      address: "Seattle, WA",
      phone: "(206) 555-0110",
      timezone: "America/Los_Angeles",
      latitude: 47.623,
      longitude: -122.321,
    },
  });
  await lumen.db.businessHour.createMany({
    data: weekHours(lumenId, capitol.id, { closed: true, openMin: 10 * 60, closeMin: 18 * 60 }, { openMin: 10 * 60, closeMin: 18 * 60 }),
  });
  await lumen.db.register.create({ data: { tenantId: lumenId, locationId: capitol.id, name: "Front desk" } });
  await lumen.db.service.create({
    data: {
      tenantId: lumenId,
      category: "Mani Bar",
      name: "Lumen Express Manicure",
      description: "A short polish change.",
      durationMin: 30,
      priceCents: 2800,
      supplies: ["Polish", "Cuticle oil"],
    },
  });
  await lumen.db.user.create({
    data: {
      email: "maya@lumennails.example",
      name: "Maya Cho",
      role: "OWNER",
      passwordHash: await password("Demo-Lumen-2026"),
      tenantId: lumenId,
    },
  });

  console.log("Seeded The Red Lady Spa (Oak Street and Lincoln Park) and Lumen Nails.");
  console.log("Demo passwords are listed in the README.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await platform.$disconnect();
  });
