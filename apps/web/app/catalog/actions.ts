"use server";

import { requireUser } from "@/lib/auth/session";
import { publicError } from "@/lib/errors";
import { dollarsToCents, requireServiceMinutes } from "@redlady/core";
import { replaceShifts, retireCatalogRow, saveCatalogService } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function catalogUser() {
  return requireUser().then((user) => {
    if (!user.db || !user.tenantId || (user.role !== "FRONT_DESK" && user.role !== "MANAGER" && user.role !== "OWNER")) {
      redirect("/pos?error=You+cannot+edit+the+catalog.");
    }
    return user;
  });
}

async function ownerCatalog() {
  const user = await catalogUser();
  if (user.role !== "OWNER") redirect("/catalog?error=Only+the+owner+can+change+the+shared+catalog.");
  return user;
}

export async function saveService(formData: FormData) {
  const user = await ownerCatalog();
  const price = dollarsToCents(String(formData.get("price") ?? ""));
  if (price == null) redirect("/catalog?error=Please+enter+a+price.");
  const minutes = requireServiceMinutes(Number(formData.get("duration")), Number(formData.get("buffer") ?? 0) || 0);
  if (!minutes.ok) redirect(`/catalog?error=${encodeURIComponent(minutes.reason)}`);
  try {
    await saveCatalogService(user.db!, {
      tenantId: user.tenantId!,
      actorId: user.id,
      id: String(formData.get("id") ?? "") || undefined,
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? ""),
      description: String(formData.get("description") ?? ""),
      priceCents: price,
      durationMin: Number(formData.get("duration")),
      bufferMin: Number(formData.get("buffer") ?? 0) || 0,
      kind: formData.get("kind") === "ADDON" ? "ADDON" : "SERVICE",
      active: formData.get("active") === "on",
    });
  } catch (error) {
    redirect(`/catalog?error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/catalog");
  revalidatePath("/services");
  redirect("/catalog?saved=1");
}

export async function saveProduct(formData: FormData) {
  const user = await ownerCatalog();
  const price = dollarsToCents(String(formData.get("price") ?? ""));
  if (price == null) redirect("/catalog?error=Please+enter+a+price.");
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    category: (String(formData.get("category") ?? "CARE") || "CARE") as "POLISH" | "CARE" | "ART" | "TOOLS",
    description: String(formData.get("description") ?? ""),
    priceCents: price,
    active: formData.get("active") === "on",
  };
  const row = id
    ? await user.db!.product.update({ where: { id }, data })
    : await user.db!.product.create({ data: { tenantId: user.tenantId!, ...data } });
  if (!id) {
    const locations = await user.db!.location.findMany({ where: { tenantId: user.tenantId! } });
    if (locations.length) {
      await user.db!.locationStock.createMany({
        data: locations.map((location) => ({ tenantId: user.tenantId!, locationId: location.id, productId: row.id, stock: 0, lowStockAlert: 5 })),
      });
    }
  }
  await user.db!.auditEvent.create({
    data: { tenantId: user.tenantId!, actorId: user.id, action: id ? "CATALOG_UPDATE" : "CATALOG_CREATE", entityType: "Product", entityId: row.id, summary: `${id ? "Updated" : "Added"} product ${row.name}.` },
  });
  revalidatePath("/catalog");
  redirect("/catalog?saved=1");
}

export async function saveTechnician(formData: FormData) {
  const user = await ownerCatalog();
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    roleTitle: String(formData.get("roleTitle") ?? "Technician"),
    specialties: String(formData.get("specialties") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    active: formData.get("active") === "on",
  };
  if (data.name.length < 2) redirect("/catalog?error=Please+name+the+technician.");
  const row = id ? await user.db!.technician.update({ where: { id }, data }) : await user.db!.technician.create({ data: { tenantId: user.tenantId!, ...data } });
  const locationIds = formData.getAll("locationId").map(String);
  await user.db!.technicianLocation.deleteMany({ where: { tenantId: user.tenantId!, technicianId: row.id } });
  if (locationIds.length) {
    await user.db!.technicianLocation.createMany({ data: locationIds.map((locationId) => ({ tenantId: user.tenantId!, technicianId: row.id, locationId })) });
  }
  await user.db!.auditEvent.create({
    data: { tenantId: user.tenantId!, actorId: user.id, action: id ? "CATALOG_UPDATE" : "CATALOG_CREATE", entityType: "Technician", entityId: row.id, summary: `${id ? "Updated" : "Added"} technician ${row.name}.` },
  });
  revalidatePath("/catalog");
  redirect("/catalog?saved=1");
}

export async function retireRow(formData: FormData) {
  const user = await ownerCatalog();
  if (formData.get("confirm") !== "yes") redirect("/catalog?error=Please+confirm+that+catalog+change.");
  const entityType = String(formData.get("entityType") ?? "");
  if (entityType !== "Service" && entityType !== "Product" && entityType !== "Technician") redirect("/catalog");
  try {
    await retireCatalogRow(user.db!, {
      tenantId: user.tenantId!,
      actorId: user.id,
      entityType,
      id: String(formData.get("id") ?? ""),
      remove: formData.get("remove") === "yes",
    });
  } catch (error) {
    redirect(`/catalog?error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/catalog");
  redirect("/catalog?saved=1");
}

export async function saveShifts(formData: FormData) {
  const user = await requireUser();
  if (!user.db || !user.tenantId || (user.role !== "MANAGER" && user.role !== "OWNER")) {
    redirect("/pos?error=Only+a+manager+or+the+owner+can+edit+shifts.");
  }
  const days = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const [sh, sm] = String(formData.get(`start_${day}`) ?? "09:00").split(":").map(Number);
    const [eh, em] = String(formData.get(`end_${day}`) ?? "19:00").split(":").map(Number);
    return { dayOfWeek: day, startMin: (sh || 0) * 60 + (sm || 0), endMin: (eh || 0) * 60 + (em || 0), active: formData.get(`on_${day}`) === "on" };
  });
  await replaceShifts(user.db, {
    tenantId: user.tenantId,
    actorId: user.id,
    technicianId: String(formData.get("technicianId") ?? ""),
    locationId: String(formData.get("locationId") ?? ""),
    days,
  });
  revalidatePath("/admin");
  redirect("/admin?tab=shifts&saved=1");
}
