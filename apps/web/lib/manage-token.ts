import { SignJWT, jwtVerify } from "jose";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
}

export async function signManageToken(input: { appointmentId: string; tenantId: string }) {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET is missing.");
  return new SignJWT({ purpose: "manage-visit", tenantId: input.tenantId, appointmentId: input.appointmentId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(key);
}

export async function readManageToken(token: string): Promise<{ appointmentId: string; tenantId: string } | null> {
  const key = secretKey();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.purpose !== "manage-visit" || typeof payload.appointmentId !== "string" || typeof payload.tenantId !== "string") return null;
    return { appointmentId: payload.appointmentId, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}
