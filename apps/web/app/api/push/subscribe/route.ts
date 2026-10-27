import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { z } from "zod";

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That push subscription is incomplete." }, { status: 400 });
  await salon.db.pushSubscription.upsert({
    where: { tenantId_endpoint: { tenantId: salon.id, endpoint: parsed.data.endpoint } },
    update: { userId: session.userId, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
    create: {
      tenantId: salon.id,
      userId: session.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
  });
  const mode = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? "webpush" : "stub";
  return Response.json({ accepted: true, mode });
}
