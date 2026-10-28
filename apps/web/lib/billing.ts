import { createHmac, timingSafeEqual } from "node:crypto";
import { billingMode } from "@redlady/core";

export function currentBillingMode() {
  return billingMode(process.env);
}

export async function createSubscriptionCheckout(input: { tenantId: string; email: string }) {
  if (currentBillingMode() === "stub") {
    return {
      mode: "stub" as const,
      message: "Stripe is not configured. Status changes are saved in this app only.",
    };
  }
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_ID || "",
    "line_items[0][quantity]": "1",
    success_url: `${origin}/platform?billing=success`,
    cancel_url: `${origin}/platform?billing=cancel`,
    customer_email: input.email,
    "metadata[tenantId]": input.tenantId,
    "subscription_data[metadata][tenantId]": input.tenantId,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !json.url) {
    return { mode: "stripe" as const, message: json.error?.message || "Stripe could not start checkout." };
  }
  return { mode: "stripe" as const, url: json.url };
}

export function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
