import { currentBillingMode, verifyStripeSignature } from "@/lib/billing";
import { platform } from "@redlady/db";

export async function POST(request: Request) {
  if (currentBillingMode() === "stub" || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe is not configured.", { status: 501 });
  }
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!verifyStripeSignature(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)) {
    return new Response("Invalid signature", { status: 400 });
  }
  const event = JSON.parse(payload) as {
    type?: string;
    data?: { object?: { metadata?: { tenantId?: string }; customer?: string; subscription?: string } };
  };
  const tenantId = event.data?.object?.metadata?.tenantId;
  if (!tenantId) return Response.json({ received: true });
  if (event.type === "checkout.session.completed") {
    await platform.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionStatus: "ACTIVE",
        stripeCustomerId: event.data?.object?.customer,
        stripeSubscriptionId: typeof event.data?.object?.subscription === "string" ? event.data.object.subscription : undefined,
      },
    });
  } else if (event.type === "invoice.payment_failed") {
    await platform.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "PAST_DUE" } });
  } else if (event.type === "customer.subscription.deleted") {
    await platform.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "CANCELED" } });
  }
  return Response.json({ received: true });
}
