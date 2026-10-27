"use server";

import { requireRoles } from "@/lib/auth/session";
import { publicError } from "@/lib/errors";
import { assertLocation, staffScope } from "@/lib/staff-location";
import { STAFF_LOCATION_COOKIE } from "@/lib/tenant";
import { commitCheckout } from "@redlady/db";
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
  if (status === "CHECKED_IN" || status === "IN_SERVICE" || status === "NO_SHOW" || status === "CANCELLED") {
    await user.db.appointment.update({ where: { id: visit.id }, data: { status } });
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
  try {
    await commitCheckout(user.db, { tenantId: user.tenantId, locationId, appointmentId, paymentMethod, products: lines });
  } catch (error) {
    redirect(`/pos?tab=checkout&error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/pos?tab=checkout&saved=1");
}
