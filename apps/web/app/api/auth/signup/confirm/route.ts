import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/token";
import { getPublicTenant } from "@/lib/tenant";
import { confirmSignup } from "@redlady/db";

export async function POST(request: Request) {
  const salon = await getPublicTenant();
  if (!salon) return Response.json({ error: "This address is not a salon yet." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { challengeId?: string; code?: string; name?: string; password?: string } | null;
  try {
    const { user, client } = await confirmSignup(salon.db, {
      tenantId: salon.id,
      challengeId: String(body?.challengeId ?? ""),
      code: String(body?.code ?? ""),
      name: String(body?.name ?? ""),
      passwordHash: await hashPassword(String(body?.password ?? "")),
    });
    const session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: salon.id,
      technicianId: null,
      clientId: client.id,
    };
    const token = await signSession(session);
    await setSessionCookie(session);
    return Response.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: client.id } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not confirm the account." }, { status: 400 });
  }
}
