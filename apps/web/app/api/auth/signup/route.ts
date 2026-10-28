import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/token";
import { getPublicTenant } from "@/lib/tenant";
import { registerCustomer } from "@redlady/db";
import { dispatchSms } from "@/lib/sms";

export async function POST(request: Request) {
  const salon = await getPublicTenant();
  if (!salon) return Response.json({ error: "This address is not a salon yet." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { name?: string; email?: string; phone?: string; password?: string } | null;
  const password = String(body?.password ?? "");
  if (password.length < 8) return Response.json({ error: "Use at least 8 characters for the password." }, { status: 400 });
  try {
    const result = await registerCustomer(salon.db, {
      tenantId: salon.id,
      name: String(body?.name ?? ""),
      email: String(body?.email ?? ""),
      phone: String(body?.phone ?? ""),
      passwordHash: await hashPassword(password),
    });
    if (result.status === "verify") {
      const text = `Your Red Lady code is ${result.demoCode}. It expires in 10 minutes.`;
      if (body?.phone) {
        try {
          await dispatchSms(String(body.phone), text);
        } catch (error) {
          console.log(`[sms:console] signup code failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
      }
      if (body?.email) console.log(`[email:console] to=${body.email} ${text}`);
      const demoCustomer = String(body?.email ?? "").trim().toLowerCase() === "ava@redladyspa.com";
      return Response.json({
        needsVerification: true,
        challengeId: result.challengeId,
        ...(process.env.DEMO_HINTS === "true" && demoCustomer ? { demoCode: result.demoCode } : {}),
      });
    }
    const { user, client } = result;
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
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the account." }, { status: 400 });
  }
}
