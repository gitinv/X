import { dispatchSms } from "@/lib/sms";
import { getTenantClient, platform, resolveTenantUrl, sendDueReminders } from "@redlady/db";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenants = await platform.tenant.findMany({ where: { status: "ACTIVE" } });
  const sent: { slug: string; ids: string[] }[] = [];
  for (const tenant of tenants) {
    const db = getTenantClient(tenant.id, await resolveTenantUrl(tenant));
    const ids = await sendDueReminders(db, {
      name: "reminders",
      send: async (to, body) => {
        const result = await dispatchSms(to, body);
        return { providerId: result.providerId };
      },
    });
    sent.push({ slug: tenant.slug, ids });
  }
  return Response.json({ sent });
}
