import { homeForRole, type Role } from "@redlady/core";
import { platform, type TenantClient } from "@redlady/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicTenant, type PublicSalon } from "../tenant";
import { SESSION_COOKIE, readSessionToken, signSession, type SessionClaims } from "./token";

export type Membership = { locationId: string; role: Role };

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  technicianId: string | null;
  clientId: string | null;
  db: TenantClient | null;
  memberships: Membership[];
  salon: PublicSalon | null;
};

export async function getSession() {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (cookie) {
    const session = await readSessionToken(cookie);
    if (session) return session;
  }
  const headerStore = await headers();
  const header = headerStore.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) return readSessionToken(header.slice(7).trim());
  return null;
}

export async function setSessionCookie(session: SessionClaims) {
  const token = await signSession(session);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return token;
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function requireUser(): Promise<AppUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "PLATFORM_ADMIN") {
    const admin = await platform.platformUser.findUnique({ where: { id: session.userId } });
    if (!admin) redirect("/login");
    return { ...session, id: admin.id, db: null, memberships: [], salon: null };
  }
  const salon = await getPublicTenant();
  if (!salon || !session.tenantId || salon.id !== session.tenantId) redirect("/login");
  const user = await salon.db.user.findUnique({ where: { id: session.userId }, include: { assignments: true } });
  if (!user || user.tenantId !== session.tenantId) redirect("/login");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    technicianId: user.technicianId,
    clientId: user.clientId,
    db: salon.db,
    memberships: user.assignments.map((assignment) => ({ locationId: assignment.locationId, role: assignment.role })),
    salon,
  };
}

export async function requireRoles(roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}
