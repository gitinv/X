"use server";

import { requireRoles } from "@/lib/auth/session";
import { assertLocation } from "@/lib/staff-location";
import { canSoftDeletePhoto } from "@redlady/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "studio";
}

export async function saveLocation(formData: FormData) {
  const user = await requireRoles(["OWNER", "MANAGER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "America/New_York").trim(),
    brandColor: String(formData.get("brandColor") ?? "").trim() || null,
    tagline: String(formData.get("tagline") ?? "").trim() || null,
    subdomain: String(formData.get("subdomain") ?? "").trim() || null,
    customDomain: String(formData.get("customDomain") ?? "").trim().toLowerCase() || null,
  };
  if (data.name.length < 2) redirect("/admin?error=Please+name+the+location.");
  if (id) {
    assertLocation(user, id);
    await user.db.location.update({ where: { id }, data });
  } else if (user.role !== "OWNER") {
    redirect("/admin?error=Only+the+owner+can+add+a+location.");
  } else {
    const location = await user.db.location.create({
      data: { tenantId: user.tenantId, slug: slugify(data.name), ...data, active: true },
    });
    await user.db.businessHour.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        tenantId: user.tenantId!,
        locationId: location.id,
        dayOfWeek: day,
        closed: day === 0,
        openMin: 9 * 60,
        closeMin: 19 * 60,
      })),
    });
    await user.db.register.create({ data: { tenantId: user.tenantId, locationId: location.id, name: `${data.name} front desk` } });
    const products = await user.db.product.findMany({ where: { tenantId: user.tenantId } });
    if (products.length) {
      await user.db.locationStock.createMany({
        data: products.map((product) => ({ tenantId: user.tenantId!, locationId: location.id, productId: product.id, stock: 0, lowStockAlert: 5 })),
      });
    }
  }
  revalidatePath("/admin");
  redirect("/admin?saved=1");
}

export async function setLocationActive(formData: FormData) {
  const user = await requireRoles(["OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const activeCount = await user.db.location.count({ where: { tenantId: user.tenantId, active: true } });
  if (!active && activeCount <= 1) redirect("/admin?error=Keep+at+least+one+open+location.");
  await user.db.location.update({ where: { id }, data: { active } });
  revalidatePath("/admin");
  redirect("/admin?saved=1");
}

export async function saveHours(formData: FormData) {
  const user = await requireRoles(["OWNER", "MANAGER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const locationId = String(formData.get("locationId") ?? "");
  assertLocation(user, locationId);
  for (let day = 0; day < 7; day += 1) {
    const open = String(formData.get(`open_${day}`) ?? "09:00");
    const close = String(formData.get(`close_${day}`) ?? "19:00");
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    await user.db.businessHour.upsert({
      where: { locationId_dayOfWeek: { locationId, dayOfWeek: day } },
      update: { closed: formData.get(`closed_${day}`) === "on", openMin: (oh || 0) * 60 + (om || 0), closeMin: (ch || 0) * 60 + (cm || 0) },
      create: {
        tenantId: user.tenantId,
        locationId,
        dayOfWeek: day,
        closed: formData.get(`closed_${day}`) === "on",
        openMin: (oh || 0) * 60 + (om || 0),
        closeMin: (ch || 0) * 60 + (cm || 0),
      },
    });
  }
  revalidatePath("/admin");
  redirect("/admin?tab=hours&saved=1");
}

export async function saveOffer(formData: FormData) {
  const user = await requireRoles(["OWNER", "MANAGER", "FRONT_DESK"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const serviceId = String(formData.get("serviceId") ?? "");
  const locationId = String(formData.get("locationId") ?? "");
  try {
    assertLocation(user, locationId);
  } catch {
    redirect("/admin?tab=catalog&error=That+studio+is+outside+your+access.");
  }
  const available = formData.get("available") === "on";
  const price = String(formData.get("price") ?? "").trim();
  const duration = String(formData.get("duration") ?? "").trim();
  const buffer = String(formData.get("buffer") ?? "").trim();
  const existing = await user.db.serviceLocation.findUnique({ where: { serviceId_locationId: { serviceId, locationId } } });
  const priceCents = price ? Math.round(Number(price) * 100) : existing?.priceCents ?? null;
  const parsedDuration = duration ? Number(duration) : null;
  if (parsedDuration !== null && (!Number.isInteger(parsedDuration) || parsedDuration <= 0)) {
    redirect("/admin?tab=catalog&error=Please+enter+a+duration+greater+than+0+minutes.");
  }
  const durationMin = parsedDuration ?? existing?.durationMin ?? null;
  const parsedBuffer = buffer ? Number(buffer) : null;
  if (parsedBuffer !== null && (!Number.isInteger(parsedBuffer) || parsedBuffer < 0)) {
    redirect("/admin?tab=catalog&error=Please+enter+a+buffer+of+0+minutes+or+more.");
  }
  const bufferMin = parsedBuffer ?? existing?.bufferMin ?? null;
  await user.db.serviceLocation.upsert({
    where: { serviceId_locationId: { serviceId, locationId } },
    update: { available, priceCents, durationMin, bufferMin },
    create: { tenantId: user.tenantId, serviceId, locationId, available, priceCents, durationMin, bufferMin },
  });
  revalidatePath("/admin");
  revalidatePath("/catalog");
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") ? next : "/admin?tab=catalog&saved=1");
}

export async function saveBranding(formData: FormData) {
  const user = await requireRoles(["OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  await user.db.salonProfile.update({
    where: { tenantId: user.tenantId },
    data: {
      name: String(formData.get("name") ?? ""),
      tagline: String(formData.get("tagline") ?? ""),
      about: String(formData.get("about") ?? ""),
      brandColor: String(formData.get("brandColor") ?? "#7A1F2B"),
      photoConsentRequired: formData.get("photoConsentRequired") === "on",
      cancellationWindowHours: (() => {
        const hours = Number(formData.get("cancellationWindowHours"));
        return Number.isInteger(hours) && hours >= 0 ? hours : 24;
      })(),
      cancellationLatePolicy: String(formData.get("cancellationLatePolicy") ?? "").trim() || "Please call the studio.",
    },
  });
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?tab=branding&saved=1");
}

export async function saveTechLocations(formData: FormData) {
  const user = await requireRoles(["OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const technicianId = String(formData.get("technicianId") ?? "");
  const locationIds = formData.getAll("locationId").map(String);
  await user.db.technicianLocation.deleteMany({ where: { tenantId: user.tenantId, technicianId } });
  if (locationIds.length) {
    await user.db.technicianLocation.createMany({
      data: locationIds.map((locationId) => ({ tenantId: user.tenantId!, technicianId, locationId })),
    });
  }
  revalidatePath("/admin");
  redirect("/admin?tab=team&saved=1");
}

export async function assignStaff(formData: FormData) {
  const user = await requireRoles(["OWNER"]);
  if (!user.db || !user.tenantId) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const locationId = String(formData.get("locationId") ?? "");
  const role = String(formData.get("role") ?? "FRONT_DESK");
  const staffRole = role === "MANAGER" || role === "TECHNICIAN" || role === "FRONT_DESK" ? role : "FRONT_DESK";
  const staff = await user.db.user.findFirst({ where: { tenantId: user.tenantId, email } });
  if (!staff) redirect("/admin?tab=team&error=That+email+is+not+a+staff+login.");
  await user.db.staffAssignment.upsert({
    where: { userId_locationId: { userId: staff.id, locationId } },
    update: { role: staffRole },
    create: { tenantId: user.tenantId, userId: staff.id, locationId, role: staffRole },
  });
  revalidatePath("/admin");
  redirect("/admin?tab=team&saved=1");
}

export async function softDeletePhoto(formData: FormData) {
  const user = await requireRoles(["OWNER"]);
  if (!user.db || !user.tenantId || !canSoftDeletePhoto(user.role)) redirect("/admin");
  const id = String(formData.get("id") ?? "");
  const photo = await user.db.servicePhoto.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!photo || photo.deletedAt) redirect("/admin?tab=photos");
  await user.db.servicePhoto.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } });
  await user.db.photoAudit.create({ data: { tenantId: user.tenantId, photoId: id, action: "SOFT_DELETE", actorId: user.id, note: "Owner removed the photo from view." } });
  revalidatePath("/admin");
  redirect("/admin?tab=photos&saved=1");
}
