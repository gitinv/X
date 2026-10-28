import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { buildTurnBoard, canAccessLocation, roleCan } from "@redlady/core";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !roleCan(session.role, "tech")) return Response.json({ error: "Sign in first." }, { status: 401 });
  const salon = await getPublicTenant();
  if (!salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const user = await salon.db.user.findUnique({ where: { id: session.userId }, include: { assignments: true } });
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const slug = new URL(request.url).searchParams.get("location");
  const location = salon.locations.find((item) => item.slug === slug) ?? salon.locations[0];
  if (!location) return Response.json({ current: null, next: null, queue: [], supplies: [] });
  if (!canAccessLocation({ role: user.role, memberships: user.assignments, locationId: location.id })) {
    return Response.json({ error: "That location is outside your access." }, { status: 403 });
  }
  const horizon = new Date(Date.now() + 18 * 60 * 60 * 1000);
  const visits = await salon.db.appointment.findMany({
    where: { tenantId: salon.id, locationId: location.id, status: { in: ["BOOKED", "CHECKED_IN", "IN_SERVICE"] }, startAt: { lt: horizon } },
    include: { client: true, service: true, technician: true },
  });
  const board = buildTurnBoard(
    visits.map((visit) => ({
      id: visit.id,
      status: visit.status,
      start: visit.startAt,
      clientName: visit.client.name,
      technicianName: visit.technician.name,
      serviceName: visit.service.name,
      supplies: visit.service.supplies,
    })),
  );
  return Response.json({
    location: { id: location.id, slug: location.slug, name: location.name },
    current: board.current ? { ...board.current, start: board.current.start.toISOString() } : null,
    next: board.next ? { ...board.next, start: board.next.start.toISOString() } : null,
    queue: board.queue.map((visit) => ({ ...visit, start: visit.start.toISOString() })),
    supplies: board.supplies,
  });
}
