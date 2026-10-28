import { getSession } from "@/lib/auth/session";
import { publicError } from "@/lib/errors";
import { getPublicTenant } from "@/lib/tenant";
import { canAccessLocation } from "@redlady/core";
import { refundTicket } from "@redlady/db";

export async function POST(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (session.role !== "FRONT_DESK" && session.role !== "MANAGER" && session.role !== "OWNER") {
    return Response.json({ error: "Refunds are taken at the desk." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { orderId?: string; amountCents?: number; reason?: string } | null;
  const order = body?.orderId ? await salon.db.order.findFirst({ where: { id: body.orderId, tenantId: salon.id } }) : null;
  if (!order) return Response.json({ error: "That ticket was not found." }, { status: 404 });
  const user = await salon.db.user.findUnique({ where: { id: session.userId }, include: { assignments: true } });
  if (!user || !canAccessLocation({ role: user.role, memberships: user.assignments, locationId: order.locationId })) {
    return Response.json({ error: "That location is outside your access." }, { status: 403 });
  }
  try {
    const refund = await refundTicket(salon.db, {
      tenantId: salon.id,
      actorId: user.id,
      orderId: order.id,
      amountCents: Number(body?.amountCents),
      reason: String(body?.reason ?? ""),
    });
    return Response.json({ id: refund.id, amountCents: refund.amountCents });
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
