"use server";

import { readManageToken } from "@/lib/manage-token";
import { getPublicTenant } from "@/lib/tenant";
import { canCustomerCancel } from "@redlady/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function cancelGuestVisit(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const claims = await readManageToken(token);
  if (!claims || String(formData.get("confirm")) !== "yes") redirect(`/book/manage/${token}?error=confirm`);
  const salon = await getPublicTenant();
  if (!salon || salon.id !== claims.tenantId) redirect(`/book/manage/${token}?error=missing`);
  const visit = await salon.db.appointment.findFirst({
    where: { id: claims.appointmentId, tenantId: salon.id },
    include: { salon: true },
  });
  if (!visit) redirect(`/book/manage/${token}?error=missing`);
  if (visit.status === "CANCELLED") redirect(`/book/manage/${token}?cancelled=1`);
  if (visit.status === "COMPLETED" || visit.status === "IN_SERVICE") redirect(`/book/manage/${token}?error=closed`);
  if (!canCustomerCancel(visit.startAt, new Date(), visit.salon.cancellationWindowHours)) redirect(`/book/manage/${token}?error=window`);
  await salon.db.appointment.update({ where: { id: visit.id }, data: { status: "CANCELLED" } });
  revalidatePath("/account");
  revalidatePath("/pos");
  redirect(`/book/manage/${token}?cancelled=1`);
}
