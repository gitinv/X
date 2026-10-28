"use server";

import { requireRoles } from "@/lib/auth/session";
import { publicError } from "@/lib/errors";
import { assertLocation, staffScope } from "@/lib/staff-location";
import { STAFF_LOCATION_COOKIE } from "@/lib/tenant";
import { discountCents } from "@redlady/core";
import { cancelVisit, commitCheckout, refundTicket, rescheduleVisit, saveVisitTicket } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function setStaffLocation(formData: FormData) {
  await requireRoles(["FRONT_DESK", "MANAGER", "OWNER", "TECHNICIAN"]);
  const jar = await cookies();
  jar.set(STAFF_LOCATION_COOKIE, String(formData.get("location") ?? ""), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
  });
  const next = String(formData.get("next") ?? "/pos");
  redirect(next.startsWith("/") ? next : "/pos");
}

export async function updateVisit(formData: FormData) {
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER", "TECHNICIAN"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const visit = await user.db.appointment.findFirst({ where: { id: String(formData.get("id") ?? ""), tenantId: user.tenantId } });
  if (!visit) redirect("/pos");
  assertLocation(user, visit.locationId);
  const status = String(formData.get("status") ?? "");
  if (status === "CHECKED_IN" || status === "IN_SERVICE" || status === "READY" || status === "NO_SHOW") {
    await user.db.appointment.update({ where: { id: visit.id }, data: { status } });
    if (status === "READY" || status === "IN_SERVICE") {
      await user.db.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          action: status === "READY" ? "SERVICE_FINISH" : "SERVICE_START",
          entityType: "Appointment",
          entityId: visit.id,
          summary: status === "READY" ? "Finished the service and sent it to checkout." : "Started the service.",
        },
      });
    }
  }
  const technicianId = String(formData.get("technicianId") ?? "");
  if (technicianId) {
    const assigned = await user.db.technicianLocation.findFirst({
      where: { tenantId: user.tenantId, technicianId, locationId: visit.locationId, active: true },
    });
    if (assigned) await user.db.appointment.update({ where: { id: visit.id }, data: { technicianId } });
  }
  if (formData.get("consent") === "on") {
    await user.db.client.update({ where: { id: visit.clientId }, data: { photoConsentAt: new Date(), photoConsentById: user.id } });
  }
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/pos");
}

export async function takePayment(formData: FormData) {
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const locationId = String(formData.get("locationId") ?? "");
  assertLocation(user, locationId);
  const appointmentId = String(formData.get("appointmentId") ?? "") || undefined;
  const method = String(formData.get("paymentMethod") ?? "CARD");
  const paymentMethod = method === "CASH" || method === "TAP" || method === "CARD" ? method : "CARD";
  const products = await user.db.locationStock.findMany({ where: { tenantId: user.tenantId, locationId }, include: { product: true } });
  const lines = products
    .map((row) => ({ productId: row.productId, quantity: Number(formData.get(`qty_${row.productId}`) ?? 0) }))
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0);
  const tipCents = Math.round(Number(formData.get("tip") ?? 0) * 100) || 0;
  const discountValue = Number(formData.get("discount") ?? 0) || 0;
  const discountMode = formData.get("discountMode") === "percent" ? "percent" : "amount";
  let discountAmount = 0;
  if (appointmentId) {
    const visit = await user.db.appointment.findFirst({ where: { id: appointmentId, tenantId: user.tenantId }, include: { lines: true, service: true } });
    const subtotal =
      (visit?.lines.reduce((sum, line) => sum + line.priceCents, 0) ?? 0) +
      lines.reduce((sum, line) => sum + (products.find((row) => row.productId === line.productId)?.product.priceCents ?? 0) * line.quantity, 0);
    discountAmount = discountCents(subtotal, discountMode, discountMode === "percent" ? discountValue : Math.round(discountValue * 100));
  }
  try {
    await commitCheckout(user.db, {
      tenantId: user.tenantId,
      locationId,
      appointmentId,
      paymentMethod,
      products: lines,
      tipCents,
      discountCents: discountAmount,
    });
  } catch (error) {
    redirect(`/pos?tab=checkout&error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/pos?tab=checkout&saved=1");
}

export async function saveTicket(formData: FormData) {
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const locationId = String(formData.get("locationId") ?? "");
  assertLocation(user, locationId);
  const serviceIds = formData.getAll("serviceId").map(String).filter(Boolean);
  const when = String(formData.get("start") ?? "");
  const startAt = when ? new Date(when) : new Date();
  try {
    await saveVisitTicket(user.db, {
      tenantId: user.tenantId,
      actorId: user.id,
      locationId,
      appointmentId: String(formData.get("appointmentId") ?? "") || undefined,
      clientId: String(formData.get("clientId") ?? "") || undefined,
      walkIn: { name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? ""), email: String(formData.get("email") ?? "") },
      technicianId: String(formData.get("technicianId") ?? ""),
      serviceIds,
      startAt,
    });
  } catch (error) {
    redirect(`/pos?tab=ticket&error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/pos?saved=1");
}

export async function rescheduleFromDesk(formData: FormData) {
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  try {
    await rescheduleVisit(user.db, {
      tenantId: user.tenantId,
      actorId: user.id,
      appointmentId: String(formData.get("id") ?? ""),
      startAt: new Date(String(formData.get("start") ?? "")),
      confirm: formData.get("confirm") === "yes",
    });
  } catch (error) {
    redirect(`/pos?error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/pos");
  redirect("/pos?saved=1");
}

export async function cancelFromDesk(formData: FormData) {
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  try {
    await cancelVisit(user.db, {
      tenantId: user.tenantId,
      actorId: user.id,
      appointmentId: String(formData.get("id") ?? ""),
      confirm: formData.get("confirm") === "yes",
    });
  } catch (error) {
    redirect(`/pos?error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/pos?saved=1");
}

export async function refundFromDesk(formData: FormData) {
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  try {
    await refundTicket(user.db, {
      tenantId: user.tenantId,
      actorId: user.id,
      orderId: String(formData.get("orderId") ?? ""),
      amountCents: Math.round(Number(formData.get("amount") ?? 0) * 100),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(`/pos?tab=checkout&error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/admin");
  redirect("/pos?tab=checkout&saved=1");
}
