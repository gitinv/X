import { distanceKm } from "@redlady/core";
import { getTenantClient, platform, resetConnections, resolveTenantUrl, withDatabaseRetry, type TenantClient } from "@redlady/db";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, readSessionToken } from "./auth/token";

export const LOCATION_COOKIE = "redlady_location";
export const STAFF_LOCATION_COOKIE = "redlady_staff_location";

export type SalonHours = { dayOfWeek: number; openMin: number; closeMin: number; closed: boolean };

export type SalonLocation = {
  id: string;
  slug: string;
  name: string;
  address: string;
  phone: string;
  email: string | null;
  timezone: string;
  brandColor: string | null;
  accentColor: string | null;
  tagline: string | null;
  latitude: number | null;
  longitude: number | null;
  subdomain: string | null;
  customDomain: string | null;
  active: boolean;
  hours: SalonHours[];
};

export type PublicSalon = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  phone: string;
  email: string;
  address: string;
  brandColor: string;
  accentColor: string;
  timezone: string;
  cancellationWindowHours: number;
  cancellationLatePolicy: string;
  photoConsentRequired: boolean;
  campaign: {
    title: string;
    influencer: string;
    description: string;
    priceCents: number;
    imageUrl: string | null;
    active: boolean;
  } | null;
  db: TenantClient;
  locations: SalonLocation[];
  location: SalonLocation;
};

function mapLocation(location: {
  id: string;
  slug: string;
  name: string;
  address: string;
  phone: string;
  email: string | null;
  timezone: string;
  brandColor: string | null;
  accentColor: string | null;
  tagline: string | null;
  latitude: number | null;
  longitude: number | null;
  subdomain: string | null;
  customDomain: string | null;
  active: boolean;
  hours: SalonHours[];
}): SalonLocation {
  return location;
}

function nearestLocation(locations: SalonLocation[], near: { latitude: number; longitude: number }) {
  return locations
    .filter((location) => location.latitude != null && location.longitude != null)
    .map((location) => ({
      location,
      distance: distanceKm(near, { latitude: location.latitude as number, longitude: location.longitude as number }),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.location;
}

export async function getPublicTenant(preference?: {
  locationSlug?: string | null;
  near?: { latitude: number; longitude: number } | null;
}): Promise<PublicSalon | null> {
  return withDatabaseRetry(() => loadPublicTenant(preference), { beforeRetry: resetConnections });
}

async function loadPublicTenant(preference?: {
  locationSlug?: string | null;
  near?: { latitude: number; longitude: number } | null;
}): Promise<PublicSalon | null> {
  const headerStore = await headers();
  const host = (headerStore.get("x-forwarded-host") || headerStore.get("host") || "").split(":")[0]?.toLowerCase() ?? "";
  const hintedSlug = headerStore.get("x-tenant-slug") || process.env.DEFAULT_TENANT_SLUG || "red-lady-spa";
  const domain = host ? await platform.tenantDomain.findUnique({ where: { hostname: host }, include: { tenant: true } }) : null;
  const registry = domain?.tenant ?? (await platform.tenant.findFirst({ where: { slug: hintedSlug, status: "ACTIVE" } }));
  if (!registry) return null;
  const db = getTenantClient(registry.id, await resolveTenantUrl(registry));
  const profile = await db.salonProfile.findUnique({ where: { tenantId: registry.id }, include: { campaign: true } });
  if (!profile) return null;
  const rows = await db.location.findMany({
    where: { tenantId: registry.id, active: true },
    include: { hours: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  const locations = rows.map(mapLocation);
  if (locations.length === 0) return null;

  const jar = await cookies();
  const cookieSlug = jar.get(LOCATION_COOKIE)?.value;
  const headerLocation = headerStore.get("x-location-slug");
  const wanted = preference?.locationSlug || domain?.locationSlug || headerLocation || cookieSlug;
  let location =
    locations.find((item) => item.slug === wanted) ??
    locations.find((item) => item.subdomain === wanted) ??
    locations.find((item) => item.customDomain === host) ??
    null;
  if (!location) {
    const token = jar.get(SESSION_COOKIE)?.value;
    const session = token ? await readSessionToken(token) : null;
    if (session?.clientId && session.tenantId === registry.id) {
      const client = await db.client.findFirst({ where: { id: session.clientId, tenantId: registry.id } });
      location = locations.find((item) => item.id === client?.lastLocationId) ?? null;
    }
  }
  if (!location && preference?.near) location = nearestLocation(locations, preference.near) ?? null;
  location = location ?? locations[0]!;

  return {
    id: registry.id,
    slug: registry.slug,
    name: profile.name,
    tagline: location.tagline || profile.tagline,
    about: profile.about,
    phone: location.phone || profile.phone,
    email: location.email || profile.email,
    address: location.address || profile.address,
    brandColor: location.brandColor || profile.brandColor,
    accentColor: location.accentColor || profile.accentColor,
    timezone: location.timezone || profile.timezone,
    cancellationWindowHours: profile.cancellationWindowHours,
    cancellationLatePolicy: profile.cancellationLatePolicy,
    photoConsentRequired: profile.photoConsentRequired,
    campaign: profile.campaign,
    db,
    locations,
    location,
  };
}

export function weekdayIndex(date: string, timeZone: string, noon: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

export function parseNear(value: string | undefined) {
  if (!value) return null;
  const [lat, lng] = value.split(",").map((part) => Number(part));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}
