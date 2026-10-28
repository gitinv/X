import { authenticate } from "@/lib/auth/authenticate";
import { setSessionCookie } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/token";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const session = await authenticate(String(body?.email ?? ""), String(body?.password ?? ""));
  if (!session) return Response.json({ error: "Those details don't match a login." }, { status: 401 });
  const token = await signSession(session);
  await setSessionCookie(session);
  return Response.json({
    token,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      tenantId: session.tenantId,
      technicianId: session.technicianId,
      clientId: session.clientId,
    },
  });
}
