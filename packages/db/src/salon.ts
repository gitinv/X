import { InventoryError, findBookingConflict, planInventoryDecrement, requireTenantId } from "@redlady/core";
import { Prisma, type PaymentMethod, type PrismaClient } from "./generated/tenant";

type Db = PrismaClient | Prisma.TransactionClient;

export class BookingConflictError extends Error {
  readonly appointmentId: string;

  constructor(appointmentId: string) {
    super("That technician is already booked then.");
    this.name = "BookingConflictError";
    this.appointmentId = appointmentId;
  }
}

export async function clearTenantDatabase(db: PrismaClient) {
  await db.photoAudit.deleteMany();
  await db.servicePhoto.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.smsMessage.deleteMany();
  await db.pushSubscription.deleteMany();
  await db.appointment.deleteMany();
  await db.staffAssignment.deleteMany();
  await db.technicianLocation.deleteMany();
  await db.serviceLocation.deleteMany();
  await db.locationStock.deleteMany();
  await db.register.deleteMany();
  await db.user.updateMany({ data: { technicianId: null, clientId: null } });
  await db.user.deleteMany();
  await db.technician.deleteMany();
  await db.client.deleteMany();
  await db.service.deleteMany();
  await db.product.deleteMany();
  await db.businessHour.deleteMany();
  await db.location.deleteMany();
  await db.campaign.deleteMany();
  await db.trend.deleteMany();
  await db.salonProfile.deleteMany();
}

export async function createBooking(
  db: Db,
  input: {
    tenantId: string;
    locationId: string;
    clientId: string;
    technicianId: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
    notes?: string;
  },
) {
  const tenantId = requireTenantId(input.tenantId);
  const existing = await db.appointment.findMany({
    where: {
      tenantId,
      technicianId: input.technicianId,
      status: { in: ["BOOKED", "CHECKED_IN", "IN_SERVICE"] },
    },
  });
  const conflict = findBookingConflict(
    existing.map((appointment) => ({
      id: appointment.id,
      technicianId: appointment.technicianId,
      start: appointment.startAt,
      end: appointment.endAt,
      status: appointment.status,
    })),
    { technicianId: input.technicianId, start: input.startAt, end: input.endAt },
  );
  if (conflict) throw new BookingConflictError(conflict.id);

  return db.appointment.create({
    data: {
      tenantId,
      locationId: input.locationId,
      clientId: input.clientId,
      technicianId: input.technicianId,
      serviceId: input.serviceId,
      startAt: input.startAt,
      endAt: input.endAt,
      notes: input.notes,
      status: "BOOKED",
      paymentStatus: "UNPAID",
    },
  });
}

export async function commitCheckout(
  db: PrismaClient,
  input: {
    tenantId: string;
    locationId: string;
    registerId?: string;
    appointmentId?: string;
    clientId?: string;
    paymentMethod: PaymentMethod;
    products: { productId: string; quantity: number }[];
  },
) {
  const tenantId = requireTenantId(input.tenantId);
  if (!input.appointmentId && input.products.length === 0) {
    throw new InventoryError("Add a service or a product before taking payment.");
  }

  return db.$transaction(async (tx) => {
    const items: { kind: string; productId?: string; name: string; quantity: number; unitCents: number }[] = [];
    let clientId = input.clientId;

    if (input.appointmentId) {
      const appointment = await tx.appointment.findFirst({
        where: { id: input.appointmentId, tenantId },
        include: { service: true },
      });
      if (!appointment) throw new Error("That visit is not on this salon's book.");
      if (appointment.locationId !== input.locationId) throw new Error("That visit is at another location.");
      if (appointment.status === "CANCELLED") throw new Error("That visit was cancelled.");
      if (appointment.paymentStatus === "PAID") throw new Error("That visit is already paid.");
      clientId = appointment.clientId;
      const override = await tx.serviceLocation.findUnique({
        where: { serviceId_locationId: { serviceId: appointment.serviceId, locationId: appointment.locationId } },
      });
      items.push({
        kind: "SERVICE",
        name: appointment.service.name,
        quantity: 1,
        unitCents: override?.priceCents ?? appointment.service.priceCents,
      });
    }

    const productIds = [...new Set(input.products.map((line) => line.productId))];
    const products = productIds.length
      ? await tx.product.findMany({ where: { tenantId, id: { in: productIds }, active: true } })
      : [];
    const stocks = productIds.length
      ? await tx.locationStock.findMany({ where: { tenantId, locationId: input.locationId, productId: { in: productIds } } })
      : [];
    if (products.length !== productIds.length || stocks.length !== productIds.length) {
      throw new InventoryError("One of those products is not in this location's inventory.");
    }
    const updates = planInventoryDecrement(
      stocks.map((row) => {
        const product = products.find((item) => item.id === row.productId);
        return {
          productId: row.productId,
          name: product?.name ?? "Product",
          onHand: row.stock,
          lowStockAlert: row.lowStockAlert,
        };
      }),
      input.products,
    );
    for (const update of updates) {
      await tx.locationStock.update({
        where: { locationId_productId: { locationId: input.locationId, productId: update.productId } },
        data: { stock: update.onHand },
      });
    }
    for (const line of input.products) {
      const product = products.find((item) => item.id === line.productId);
      if (!product) continue;
      items.push({
        kind: "PRODUCT",
        productId: product.id,
        name: product.name,
        quantity: line.quantity,
        unitCents: product.priceCents,
      });
    }

    const totalCents = items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
    const order = await tx.order.create({
      data: {
        tenantId,
        locationId: input.locationId,
        registerId: input.registerId,
        appointmentId: input.appointmentId,
        clientId,
        status: "PAID",
        paymentMethod: input.paymentMethod,
        totalCents,
        items: {
          create: items.map((item) => ({
            kind: item.kind,
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitCents: item.unitCents,
          })),
        },
      },
    });

    if (input.appointmentId) {
      await tx.appointment.update({
        where: { id: input.appointmentId },
        data: { status: "COMPLETED", paymentStatus: "PAID" },
      });
    }

    return order;
  });
}

export interface SmsSendResult {
  providerId: string;
}

export async function recordSms(
  db: Db,
  input: {
    tenantId: string;
    to: string;
    body: string;
    provider: string;
    providerId?: string;
    status?: "SENT" | "FAILED" | "SKIPPED";
    error?: string;
  },
) {
  return db.smsMessage.create({
    data: {
      tenantId: requireTenantId(input.tenantId),
      to: input.to,
      body: input.body,
      provider: input.provider,
      providerId: input.providerId,
      status: input.status ?? "SENT",
      error: input.error,
    },
  });
}

export async function sendDueReminders(
  db: PrismaClient,
  driver: { name: string; send: (to: string, body: string) => Promise<SmsSendResult> },
  options?: { now?: Date; leadHoursMin?: number; leadHoursMax?: number },
) {
  const now = options?.now ?? new Date();
  const minHours = options?.leadHoursMin ?? 20;
  const maxHours = options?.leadHoursMax ?? 28;
  const windowStart = new Date(now.getTime() + minHours * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + maxHours * 60 * 60 * 1000);
  const due = await db.appointment.findMany({
    where: {
      status: "BOOKED",
      reminderSentAt: null,
      startAt: { gte: windowStart, lte: windowEnd },
    },
    include: { client: true, service: true, salon: true, location: true },
  });

  const sent: string[] = [];
  for (const appointment of due) {
    const phone = appointment.client.phone;
    if (!phone) continue;
    const body = `${appointment.salon.name} (${appointment.location.name}): reminder for ${appointment.service.name} on ${appointment.startAt.toLocaleString("en-US", { timeZone: appointment.location.timezone })}.`;
    try {
      const result = await driver.send(phone, body);
      await recordSms(db, {
        tenantId: appointment.tenantId,
        to: phone,
        body,
        provider: driver.name,
        providerId: result.providerId,
      });
      await db.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: now } });
      sent.push(appointment.id);
    } catch (error) {
      await recordSms(db, {
        tenantId: appointment.tenantId,
        to: phone,
        body,
        provider: driver.name,
        status: "FAILED",
        error: error instanceof Error ? error.message : "SMS failed",
      });
    }
  }
  return sent;
}
