import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@redlady/core";

export const SESSION_COOKIE = "redlady_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export interface SessionClaims {
  userId: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  technicianId: string | null;
  clientId: string | null;
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
}

export async function signSession(session: SessionClaims) {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET is missing. Copy .env.example to .env.");
  return new SignJWT({
    email: session.email,
    name: session.name,
    role: session.role,
    tenantId: session.tenantId,
    technicianId: session.technicianId,
    clientId: session.clientId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(key);
}

export async function readSessionToken(token: string): Promise<SessionClaims | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      userId: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role as Role,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
      technicianId: typeof payload.technicianId === "string" ? payload.technicianId : null,
      clientId: typeof payload.clientId === "string" ? payload.clientId : null,
    };
  } catch {
    return null;
  }
}
