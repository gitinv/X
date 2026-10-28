import { platform } from "@redlady/db";
import { getPublicTenant } from "../tenant";
import { verifyPassword } from "./password";
import type { SessionClaims } from "./token";

export async function authenticate(email: string, password: string): Promise<SessionClaims | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;
  const admin = await platform.platformUser.findUnique({ where: { email: normalized } });
  if (admin) {
    if (!(await verifyPassword(password, admin.passwordHash))) return null;
    return {
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: "PLATFORM_ADMIN",
      tenantId: null,
      technicianId: null,
      clientId: null,
    };
  }
  const salon = await getPublicTenant();
  if (!salon) return null;
  const user = await salon.db.user.findUnique({ where: { email: normalized } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    technicianId: user.technicianId,
    clientId: user.clientId,
  };
}
