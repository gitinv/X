import { ensureBlockIsFree } from "./salon";
import { createHash } from "node:crypto";
import { checkoutTotal, discountCents, normalizePhone, refundDecision, requireServiceMinutes, requireTenantId, reservedMinutes, samePhone, ticketSummary } from "@redlady/core";
import type { Prisma, PrismaClient, ServiceKind } from "./generated/tenant";

type Db = PrismaClient | Prisma.TransactionClient;

export class ExistingClientError extends Error {
  readonly clientId: string;

  constructor(clientId: string, name: string) {
    super(`Please use the existing client ${name}.`);
    this.name = "ExistingClientError";
    this.clientId = clientId;
  }
}

export async function findClientByContact(db: Db, tenantId: string, phone: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const clients = await db.client.findMany({ where: { tenantId } });
  return (
    clients.find((client) => (normalizedEmail && client.email?.toLowerCase() === normalizedEmail) || samePhone(client.phone, phone)) ?? null
  );
}

export async function writeAudit(
  db: Db,
  input: { tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary: string },
) {
  const tenantId = requireTenantId(input.tenantId);
  return db.auditEvent.create({ data: { ...input, tenantId } });
}

export async function searchClients(db: Db, tenantId: string, query: string) {
  const term = query.trim();
  if (term.length < 1) return db.client.findMany({ where: { tenantId }, include: { favorites: true }, orderBy: { name: "asc" }, take: 50 });
  return db.client.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ],
    },
    include: { favorites: true },
    orderBy: { name: "asc" },
    take: 50,
  });
}

async function pricedLines(db: Db, tenantId: string, locationId: string, serviceIds: string[]) {
  const services = await db.service.findMany({ where: { tenantId, id: { in: serviceIds }, active: true } });
  const overrides = await db.serviceLocation.findMany({ where: { tenantId, locationId, serviceId: { in: serviceIds } } });
  const lines = serviceIds.flatMap((serviceId, index) => {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return [];
    const override = overrides.find((item) => item.serviceId === serviceId);
    if (override && !override.available) return [];
    return [
      {
        tenantId,
        serviceId: service.id,
        name: service.name,
        kind: service.kind,
        priceCents: override?.priceCents ?? service.priceCents,
        durationMin: override?.durationMin ?? service.durationMin,
        bufferMin: override?.bufferMin ?? service.bufferMin,
        sortOrder: index,
      },
    ];
  });
  if (lines.length === 0) throw new Error("Please choose at least one service.");
  return lines;
}

export async function saveVisitTicket(
  db: PrismaClient,
  input: {
    tenantId: string;
    actorId: string;
    locationId: string;
    appointmentId?: string;
    clientId?: string;
    walkIn?: { name: string; phone: string; email?: string };
    technicianId: string;
    serviceIds: string[];
    startAt: Date;
  },
) {
  const tenantId = requireTenantId(input.tenantId);
  const lines = await pricedLines(db, tenantId, input.locationId, input.serviceIds);
  const summary = ticketSummary(lines);
  const endAt = new Date(input.startAt.getTime() + summary.durationMin * 60_000);
  let clientId = input.clientId;
  if (!clientId) {
    if (!input.walkIn || input.walkIn.name.trim().length < 2) throw new Error("Please add a client name for the walk-in.");
    const existing = await findClientByContact(db, tenantId, input.walkIn.phone, input.walkIn.email ?? "");
    if (existing) throw new ExistingClientError(existing.id, existing.name);
    const client = await db.client.create({
      data: {
        tenantId,
        name: input.walkIn.name.trim(),
        phone: input.walkIn.phone.trim() || null,
        email: input.walkIn.email?.trim() || null,
        lastLocationId: input.locationId,
      },
    });
    clientId = client.id;
    await writeAudit(db, {
      tenantId,
      actorId: input.actorId,
      action: "CLIENT_CREATE",
      entityType: "Client",
      entityId: client.id,
      summary: `Added walk-in ${client.name}.`,
    });
  }
  const primary = lines[0]!;
  const appointment = await db.$transaction(async (tx) => {
    await ensureBlockIsFree(tx, {
      tenantId,
      technicianId: input.technicianId,
      locationId: input.locationId,
      startAt: input.startAt,
      endAt,
      ignoreAppointmentId: input.appointmentId,
    });
    const saved = input.appointmentId
      ? await tx.appointment.update({
          where: { id: input.appointmentId },
          data: { clientId, technicianId: input.technicianId, serviceId: primary.serviceId, locationId: input.locationId, startAt: input.startAt, endAt },
        })
      : await tx.appointment.create({
          data: {
            tenantId,
            locationId: input.locationId,
            clientId,
            technicianId: input.technicianId,
            serviceId: primary.serviceId,
            startAt: input.startAt,
            endAt,
            status: input.startAt.getTime() > Date.now() + 2 * 60 * 1000 ? "BOOKED" : "CHECKED_IN",
            paymentStatus: "UNPAID",
          },
        });
    await tx.appointmentLine.deleteMany({ where: { appointmentId: saved.id } });
    await tx.appointmentLine.createMany({ data: lines.map((line) => ({ ...line, appointmentId: saved.id })) });
    return saved;
  });
  await db.client.update({ where: { id: clientId }, data: { lastLocationId: input.locationId } });
  await writeAudit(db, {
    tenantId,
    actorId: input.actorId,
    action: input.appointmentId ? "VISIT_UPDATE" : "VISIT_CREATE",
    entityType: "Appointment",
    entityId: appointment.id,
    summary: `${input.appointmentId ? "Updated" : "Opened"} a ticket with ${lines.length} item${lines.length === 1 ? "" : "s"}.`,
  });
  return appointment;
}

function guardInService(status: string, actorRole: string | undefined) {
  if (status === "IN_SERVICE" && actorRole !== "MANAGER" && actorRole !== "OWNER") {
    throw new Error("Please ask a manager to change a visit that is already in service.");
  }
}

export async function rescheduleVisit(db: Db, input: { tenantId: string; actorId: string; actorRole?: string; appointmentId: string; startAt: Date; confirm: boolean }) {
  if (!input.confirm) throw new Error("Please confirm the new time before saving it.");
  const tenantId = requireTenantId(input.tenantId);
  const visit = await db.appointment.findFirst({ where: { id: input.appointmentId, tenantId }, include: { lines: true } });
  if (!visit) throw new Error("That visit is not on this salon's book.");
  if (visit.status === "CANCELLED" || visit.status === "COMPLETED") throw new Error("Please pick a visit that is still on the book.");
  guardInService(visit.status, input.actorRole);
  const durationMs = visit.lines.length
    ? visit.lines.reduce((sum, line) => sum + reservedMinutes(line), 0) * 60_000
    : visit.endAt.getTime() - visit.startAt.getTime();
  const nextEnd = new Date(input.startAt.getTime() + durationMs);
  const updated = await (db as PrismaClient).$transaction(async (tx) => {
    await ensureBlockIsFree(tx, {
      tenantId,
      technicianId: visit.technicianId,
      locationId: visit.locationId,
      startAt: input.startAt,
      endAt: nextEnd,
      ignoreAppointmentId: visit.id,
    });
    return tx.appointment.update({ where: { id: visit.id }, data: { startAt: input.startAt, endAt: nextEnd } });
  });
  await writeAudit(db, {
    tenantId,
    actorId: input.actorId,
    action: "APPOINTMENT_RESCHEDULE",
    entityType: "Appointment",
    entityId: visit.id,
    summary: `Moved a visit to ${input.startAt.toISOString()}.`,
  });
  return updated;
}

export async function cancelVisit(db: Db, input: { tenantId: string; actorId: string; actorRole?: string; appointmentId: string; confirm: boolean }) {
  if (!input.confirm) throw new Error("Please confirm the cancellation before saving it.");
  const tenantId = requireTenantId(input.tenantId);
  const visit = await db.appointment.findFirst({ where: { id: input.appointmentId, tenantId } });
  if (!visit) throw new Error("That visit is not on this salon's book.");
  guardInService(visit.status, input.actorRole);
  if (visit.paymentStatus === "PAID") throw new Error("Please refund the ticket before cancelling a paid visit.");
  const updated = await db.appointment.update({ where: { id: visit.id }, data: { status: "CANCELLED" } });
  await writeAudit(db, {
    tenantId,
    actorId: input.actorId,
    action: "APPOINTMENT_CANCEL",
    entityType: "Appointment",
    entityId: visit.id,
    summary: "Cancelled a visit from the desk.",
  });
  return updated;
}

export async function refundTicket(
  db: PrismaClient,
  input: { tenantId: string; actorId: string; orderId: string; amountCents: number; reason: string },
) {
  const tenantId = requireTenantId(input.tenantId);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Please add a short reason for the refund.");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: input.orderId, tenantId }, include: { refunds: true, appointment: true } });
    if (!order) throw new Error("That ticket was not found.");
    const refunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
    const decision = refundDecision({ totalCents: order.totalCents, refundedCents: refunded, amountCents: input.amountCents });
    if (!decision.ok) throw new Error(decision.reason);
    const refund = await tx.refund.create({
      data: { tenantId, orderId: order.id, amountCents: input.amountCents, reason, createdById: input.actorId },
    });
    if (order.appointmentId) {
      await tx.appointment.update({ where: { id: order.appointmentId }, data: { paymentStatus: decision.status } });
    }
    await writeAudit(tx, {
      tenantId,
      actorId: input.actorId,
      action: "REFUND",
      entityType: "Order",
      entityId: order.id,
      summary: `Refunded ${(input.amountCents / 100).toFixed(2)} — ${reason}`,
    });
    return refund;
  });
}

export async function toggleFavorite(db: Db, input: { tenantId: string; clientId: string; technicianId: string }) {
  const tenantId = requireTenantId(input.tenantId);
  const technician = await db.technician.findFirst({ where: { id: input.technicianId, tenantId } });
  if (!technician) throw new Error("That technician is not at this salon.");
  const existing = await db.clientFavorite.findUnique({
    where: { clientId_technicianId: { clientId: input.clientId, technicianId: input.technicianId } },
  });
  if (existing) {
    await db.clientFavorite.delete({ where: { id: existing.id } });
    return { favorite: false };
  }
  await db.clientFavorite.create({ data: { tenantId, clientId: input.clientId, technicianId: input.technicianId } });
  return { favorite: true };
}

export async function registerCustomer(
  db: Db,
  input: { tenantId: string; name: string; email: string; phone: string; passwordHash: string },
) {
  const tenantId = requireTenantId(input.tenantId);
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (input.name.trim().length < 2) throw new Error("Please enter your name.");
  if (!email.includes("@") && normalizePhone(phone).length < 10) throw new Error("Please enter an email or a full phone number.");
  const taken = email ? await db.user.findUnique({ where: { email } }) : null;
  if (taken) throw new Error("Please sign in. An account already uses that email.");
  const existing = await findClientByContact(db, tenantId, phone, email);
  if (existing) {
    const linked = await db.user.findFirst({ where: { clientId: existing.id } });
    if (linked) throw new Error("Please sign in. That profile already has a login.");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const challenge = await db.signupCode.create({
      data: {
        tenantId,
        email: email || null,
        phone: normalizePhone(phone) || null,
        clientId: existing.id,
        codeHash: createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    return { status: "verify" as const, challengeId: challenge.id, demoCode: code, clientId: existing.id };
  }
  const client = await db.client.create({
    data: { tenantId, name: input.name.trim(), email: email || null, phone: phone || null },
  });
  const user = await db.user.create({
    data: {
      tenantId,
      email: email || `guest-${client.id}@clients.redlady.local`,
      name: input.name.trim(),
      phone: phone || null,
      passwordHash: input.passwordHash,
      role: "CUSTOMER",
      clientId: client.id,
    },
  });
  return { status: "created" as const, user, client };
}

export async function confirmSignup(db: Db, input: { tenantId: string; challengeId: string; code: string; name: string; passwordHash: string }) {
  const tenantId = requireTenantId(input.tenantId);
  const challenge = await db.signupCode.findFirst({ where: { id: input.challengeId, tenantId } });
  if (!challenge || challenge.expiresAt.getTime() < Date.now()) throw new Error("Please request a new code.");
  const hash = createHash("sha256").update(input.code.trim()).digest("hex");
  if (hash !== challenge.codeHash || !challenge.clientId) throw new Error("Please check the code and try again.");
  const client = await db.client.findFirst({ where: { id: challenge.clientId, tenantId } });
  if (!client) throw new Error("Please request a new code.");
  const linked = await db.user.findFirst({ where: { clientId: client.id } });
  if (linked) throw new Error("Please sign in. That profile already has a login.");
  const user = await db.user.create({
    data: {
      tenantId,
      email: challenge.email || client.email || `guest-${client.id}@clients.redlady.local`,
      name: input.name.trim() || client.name,
      phone: challenge.phone,
      passwordHash: input.passwordHash,
      role: "CUSTOMER",
      clientId: client.id,
    },
  });
  await db.signupCode.delete({ where: { id: challenge.id } });
  return { user, client };
}

export async function saveCatalogService(
  db: Db,
  input: {
    tenantId: string;
    actorId: string;
    id?: string;
    name: string;
    category: string;
    description: string;
    priceCents: number;
    durationMin: number;
    bufferMin?: number;
    kind: ServiceKind;
    active: boolean;
  },
) {
  const tenantId = requireTenantId(input.tenantId);
  const minutes = requireServiceMinutes(input.durationMin, input.bufferMin ?? 0);
  if (!minutes.ok) throw new Error(minutes.reason);
  if (input.name.trim().length < 2) throw new Error("Please name the service.");
  const data = {
    name: input.name.trim(),
    category: input.category.trim() || "Menu",
    description: input.description.trim(),
    priceCents: input.priceCents,
    durationMin: input.durationMin,
    bufferMin: input.bufferMin ?? 0,
    kind: input.kind,
    active: input.active,
  };
  const row = input.id
    ? await db.service.update({ where: { id: input.id }, data })
    : await db.service.create({ data: { tenantId, supplies: [], ...data } });
  await writeAudit(db, {
    tenantId,
    actorId: input.actorId,
    action: input.id ? "CATALOG_UPDATE" : "CATALOG_CREATE",
    entityType: "Service",
    entityId: row.id,
    summary: `${input.id ? "Updated" : "Added"} ${row.kind === "ADDON" ? "add-on" : "service"} ${row.name}.`,
  });
  return row;
}

export async function retireCatalogRow(
  db: Db,
  input: { tenantId: string; actorId: string; entityType: "Service" | "Product" | "Technician"; id: string; remove: boolean },
) {
  const tenantId = requireTenantId(input.tenantId);
  if (input.entityType === "Service") {
    const used = await db.appointment.count({ where: { tenantId, serviceId: input.id } });
    if (input.remove && used === 0) {
      await db.service.delete({ where: { id: input.id } });
    } else {
      await db.service.update({ where: { id: input.id }, data: { active: false } });
    }
  } else if (input.entityType === "Product") {
    const used = await db.orderItem.count({ where: { productId: input.id } });
    if (input.remove && used === 0) await db.product.delete({ where: { id: input.id } });
    else await db.product.update({ where: { id: input.id }, data: { active: false } });
  } else {
    const used = await db.appointment.count({ where: { tenantId, technicianId: input.id } });
    if (input.remove && used === 0) await db.technician.delete({ where: { id: input.id } });
    else await db.technician.update({ where: { id: input.id }, data: { active: false } });
  }
  await writeAudit(db, {
    tenantId,
    actorId: input.actorId,
    action: input.remove ? "CATALOG_REMOVE" : "CATALOG_DEACTIVATE",
    entityType: input.entityType,
    entityId: input.id,
    summary: `${input.remove ? "Removed" : "Deactivated"} a ${input.entityType.toLowerCase()}.`,
  });
}

export async function replaceShifts(
  db: Db,
  input: { tenantId: string; actorId: string; technicianId: string; locationId: string; days: { dayOfWeek: number; startMin: number; endMin: number; active: boolean }[] },
) {
  const tenantId = requireTenantId(input.tenantId);
  await db.shift.deleteMany({ where: { tenantId, technicianId: input.technicianId, locationId: input.locationId } });
  if (input.days.length) {
    await db.shift.createMany({
      data: input.days.map((day) => ({ tenantId, technicianId: input.technicianId, locationId: input.locationId, ...day })),
    });
  }
  const active = input.days.filter((day) => day.active);
  await writeAudit(db, {
    tenantId,
    actorId: input.actorId,
    action: "SHIFT_UPDATE",
    entityType: "Technician",
    entityId: input.technicianId,
    summary: `Updated the weekly shift (${active.length} day${active.length === 1 ? "" : "s"}).`,
  });
}

export function quoteDiscount(subtotalCents: number, mode: "percent" | "amount", value: number) {
  return checkoutTotal({ subtotalCents, discountCents: discountCents(subtotalCents, mode, value), tipCents: 0 }).discountCents;
}
