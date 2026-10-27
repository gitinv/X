"use server";

import { requireUser } from "@/lib/auth/session";
import { assertSameTenant, canCustomerCancel } from "@redlady/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function cancelVisit(formData: FormData) {
  const user = await requireUser();
  if (!user.db || !user.tenantId) redirect("/account");
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
