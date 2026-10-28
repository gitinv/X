"use server";

import { requireUser } from "@/lib/auth/session";
import { publicError } from "@/lib/errors";
import { assertSameTenant, canCustomerCancel, zonedDateTimeToUtc } from "@redlady/core";
import { rescheduleVisit } from "@redlady/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function cancelVisit(formData: FormData) {
  const user = await requireUser();
  if (!user.db || !user.tenantId) redirect("/account");
  if (String(formData.get("confirm")) !== "yes") redirect("/account?error=confirm");
  const id = String(formData.get("id") ?? "");
  const appointment = await user.db.appointment.findUnique({
    where: { id },
    include: { salon: true },
  });
  if (!appointment || appointment.tenantId !== user.tenantId) redirect("/account?error=forbidden");
  const staff = user.role === "FRONT_DESK" || user.role === "OWNER" || user.role === "TECHNICIAN" || user.role === "MANAGER";
  if (staff) {
    assertSameTenant(user.tenantId, appointment.tenantId);
  } else if (user.clientId !== appointment.clientId) {
    redirect("/account?error=forbidden");
  } else if (!canCustomerCancel(appointment.startAt, new Date(), appointment.salon.cancellationWindowHours)) {
    redirect("/account?error=window");
  }
  if (appointment.status === "CANCELLED" || appointment.status === "COMPLETED" || appointment.status === "IN_SERVICE") {
    redirect("/account?error=closed");
  }
  await user.db.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/account");
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/account?saved=1");
}

export async function rescheduleOwnVisit(formData: FormData) {
  const user = await requireUser();
  if (!user.db || !user.tenantId || !user.clientId) redirect("/account?error=forbidden");
  if (String(formData.get("confirm")) !== "yes") redirect("/account?error=confirm");
  const appointment = await user.db.appointment.findFirst({
    where: { id: String(formData.get("id") ?? ""), tenantId: user.tenantId },
    include: { location: true },
  });
  if (!appointment || appointment.clientId !== user.clientId) redirect("/account?error=forbidden");
  if (appointment.status !== "BOOKED") redirect("/account?error=closed");
  const startAt = zonedDateTimeToUtc(String(formData.get("start") ?? ""), appointment.location.timezone);
  if (!startAt || startAt.getTime() < Date.now() + 60_000) redirect("/account?error=time");
  try {
    await rescheduleVisit(user.db, {
      tenantId: user.tenantId,
      actorId: user.id,
      actorRole: user.role,
      appointmentId: appointment.id,
      startAt,
      confirm: true,
    });
  } catch (error) {
    redirect(`/account?error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/account");
  revalidatePath("/pos");
  revalidatePath("/tech");
  redirect("/account?saved=moved");
}
