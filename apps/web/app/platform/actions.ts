"use server";

import { requireRoles } from "@/lib/auth/session";
import { platform, provisionTenant } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createSalon(formData: FormData) {
  await requireRoles(["PLATFORM_ADMIN"]);
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const ownerName = String(formData.get("ownerName") ?? "Owner").trim();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");
  const includedLocations = Number(formData.get("includedLocations") ?? 1) || 1;
  const extraLocationPriceCents = Math.round(Number(formData.get("extraLocationPrice") ?? 49) * 100);
  try {
    const tenant = await provisionTenant({ slug, name, ownerEmail, ownerName, ownerPassword });
    await platform.tenant.update({
      where: { id: tenant.id },
      data: { includedLocations, extraLocationPriceCents },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The salon could not be created.";
    redirect(`/platform?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/platform");
  redirect("/platform?saved=1");
}

export async function setSubscription(formData: FormData) {
  await requireRoles(["PLATFORM_ADMIN"]);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "TRIAL");
  const subscriptionStatus = status === "ACTIVE" || status === "PAST_DUE" || status === "CANCELED" || status === "TRIAL" ? status : "TRIAL";
  const includedLocations = Number(formData.get("includedLocations") ?? 1) || 1;
  const extraLocationPriceCents = Math.round(Number(formData.get("extraLocationPrice") ?? 0) * 100);
  await platform.tenant.update({ where: { id }, data: { subscriptionStatus, includedLocations, extraLocationPriceCents } });
  revalidatePath("/platform");
  redirect("/platform?saved=1");
}
