import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { summarizeSales } from "@redlady/core";

export async function GET(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (session.role !== "MANAGER" && session.role !== "OWNER") return Response.json({ error: "Reports are for a manager or the owner." }, { status: 403 });
  const url = new URL(request.url);
  const from = new Date(`${url.searchParams.get("from") ?? "1970-01-01"}T00:00:00.000Z`);
  const to = new Date(`${url.searchParams.get("to") ?? "2100-01-01"}T23:59:59.999Z`);
  const location = url.searchParams.get("location");
  const orders = await salon.db.order.findMany({
    where: { tenantId: salon.id, createdAt: { gte: from, lte: to }, ...(location ? { location: { slug: location } } : {}) },
    include: { items: true, refunds: true, appointment: { include: { technician: true } } },
  });
  const summary = summarizeSales(
    orders.map((order) => ({
      id: order.id,
      totalCents: order.totalCents,
      tipCents: order.tipCents,
      discountCents: order.discountCents,
      technicianName: order.appointment?.technician.name ?? null,
      items: order.items.map((item) => ({ name: item.name, kind: item.kind, quantity: item.quantity, unitCents: item.unitCents })),
    })),
    orders.flatMap((order) => order.refunds.map((refund) => ({ orderId: order.id, amountCents: refund.amountCents }))),
  );
  return Response.json(summary);
}
