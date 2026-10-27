import { canAccessLocation, TenantIsolationError } from "@redlady/core";
import { cookies } from "next/headers";
import { STAFF_LOCATION_COOKIE } from "./tenant";
import type { AppUser } from "./auth/session";

export async function staffScope(user: AppUser, requested?: string | null) {
  if (!user.salon || !user.db) throw new TenantIsolationError("A salon is required for this request.");
  const jar = await cookies();
  const token = requested || jar.get(STAFF_LOCATION_COOKIE)?.value || "";
  const locations = user.role === "OWNER" ? user.salon.locations : user.salon.locations.filter((location) => canAccessLocation({ role: user.role, memberships: user.memberships, locationId: location.id }));
  if (locations.length === 0) throw new TenantIsolationError("You are not assigned to a location.");
  const all = user.role === "OWNER" && token === "all";
  const current = all ? null : locations.find((location) => location.slug === token) ?? locations[0]!;
  return { db: user.db, salon: user.salon, locations, current, all };
}

export function assertLocation(user: AppUser, locationId: string) {
  if (!canAccessLocation({ role: user.role, memberships: user.memberships, locationId })) {
    throw new TenantIsolationError("That location is outside your access.");
  }
}
