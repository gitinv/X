import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { favoriteNote } from "@redlady/core";
import { searchClients } from "@redlady/db";

export async function GET(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (session.role !== "FRONT_DESK" && session.role !== "MANAGER" && session.role !== "OWNER") {
    return Response.json({ error: "Client search is for the front desk." }, { status: 403 });
  }
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const clients = await searchClients(salon.db, salon.id, query);
  const techIds = [...new Set(clients.flatMap((client) => client.favorites.map((favorite) => favorite.technicianId)))];
  const techs = techIds.length ? await salon.db.technician.findMany({ where: { id: { in: techIds } } }) : [];
  return Response.json({
    clients: clients.map((client) => {
      const names = client.favorites.map((favorite) => techs.find((tech) => tech.id === favorite.technicianId)?.name ?? "").filter(Boolean);
      return { id: client.id, name: client.name, phone: client.phone, email: client.email, favorite: favoriteNote(client.name, names) };
    }),
  });
}
