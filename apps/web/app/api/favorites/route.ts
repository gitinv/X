import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { canEditFavorites } from "@redlady/core";
import { toggleFavorite } from "@redlady/db";

export async function POST(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canEditFavorites(session.role) || !session.clientId) {
    return Response.json({ error: "Only the customer can change favorites." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { technicianId?: string } | null;
  if (!body?.technicianId) return Response.json({ error: "Choose a technician." }, { status: 400 });
  try {
    const result = await toggleFavorite(salon.db, { tenantId: salon.id, clientId: session.clientId, technicianId: body.technicianId });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save that favorite." }, { status: 400 });
  }
}
