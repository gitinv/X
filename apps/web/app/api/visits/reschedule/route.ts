import { getSession } from "@/lib/auth/session";
import { publicError } from "@/lib/errors";
import { getPublicTenant } from "@/lib/tenant";
import { canAccessLocation } from "@redlady/core";
import { rescheduleVisit } from "@redlady/db";

export async function POST(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (session.role !== "FRONT_DESK" && session.role !== "MANAGER" && session.role !== "OWNER") {
    return Response.json({ error: "Rescheduling is for the front desk." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { appointmentId?: string; startIso?: string; confirm?: boolean } | null;
  const visit = body?.appointmentId ? await salon.db.appointment.findFirst({ where: { id: body.appointmentId, tenantId: salon.id } }) : null;
  if (!visit) return Response.json({ error: "That visit is not on this salon's book." }, { status: 404 });
  const user = await salon.db.user.findUnique({ where: { id: session.userId }, include: { assignments: true } });
  if (!user || !canAccessLocation({ role: user.role, memberships: user.assignments, locationId: visit.locationId })) {
    return Response.json({ error: "That location is outside your access." }, { status: 403 });
  }
  try {
    const updated = await rescheduleVisit(salon.db, {
      tenantId: salon.id,
      actorId: user.id,
      appointmentId: visit.id,
      startAt: new Date(String(body?.startIso ?? "")),
      confirm: body?.confirm === true,
    });
    return Response.json({ id: updated.id, startAt: updated.startAt.toISOString() });
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
