export interface LocationPoint {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  active?: boolean;
}

export interface OfferOverride {
  available: boolean;
  priceCents: number | null;
  durationMin: number | null;
  bufferMin?: number | null;
}

export function effectiveOffer(
  catalog: { priceCents: number; durationMin: number; bufferMin?: number },
  override?: OfferOverride | null,
): { priceCents: number; durationMin: number; bufferMin: number } | null {
  if (override && !override.available) return null;
  const durationMin = override?.durationMin ?? catalog.durationMin;
  if (!Number.isInteger(durationMin) || durationMin <= 0) return null;
  const bufferMin = override?.bufferMin ?? catalog.bufferMin ?? 0;
  if (!Number.isInteger(bufferMin) || bufferMin < 0) return null;
  return {
    priceCents: override?.priceCents ?? catalog.priceCents,
    durationMin,
    bufferMin,
  };
}

export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(to.longitude - from.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface AlternateSlot {
  startIso: string;
  label: string;
  technicianId: string;
  technicianName: string;
}

export interface AlternateLocation {
  locationId: string;
  name: string;
  distanceKm: number | null;
  slots: AlternateSlot[];
}

export function rankAlternateLocations(input: {
  requestedLocationId: string;
  origin: { latitude: number; longitude: number } | null;
  locations: LocationPoint[];
  slotsByLocation: Record<string, AlternateSlot[]>;
  limitLocations?: number;
  slotsPerLocation?: number;
}): AlternateLocation[] {
  const limitLocations = input.limitLocations ?? 3;
  const slotsPerLocation = input.slotsPerLocation ?? 3;
  return input.locations
    .filter((location) => location.id !== input.requestedLocationId && location.active !== false)
    .map((location) => {
      const distance =
        input.origin && location.latitude != null && location.longitude != null
          ? distanceKm(input.origin, { latitude: location.latitude, longitude: location.longitude })
          : null;
      return {
        locationId: location.id,
        name: location.name,
        distanceKm: distance,
        slots: (input.slotsByLocation[location.id] ?? []).slice(0, slotsPerLocation),
      };
    })
    .filter((location) => location.slots.length > 0)
    .sort((left, right) => {
      if (left.distanceKm == null && right.distanceKm == null) return left.name.localeCompare(right.name);
      if (left.distanceKm == null) return 1;
      if (right.distanceKm == null) return -1;
      return left.distanceKm - right.distanceKm;
    })
    .slice(0, limitLocations);
}

export interface StaffMembership {
  locationId: string;
  role: string;
}

export function canAccessLocation(input: {
  role: string;
  memberships: StaffMembership[];
  locationId: string | "all";
}): boolean {
  if (input.role === "OWNER") return true;
  if (input.locationId === "all") return false;
  return input.memberships.some((membership) => membership.locationId === input.locationId);
}

export function locationCharge(input: {
  activeLocations: number;
  includedLocations: number;
  extraLocationPriceCents: number;
}): { billableLocations: number; extraLocations: number; monthlyCents: number } {
  const extraLocations = Math.max(0, input.activeLocations - Math.max(0, input.includedLocations));
  return {
    billableLocations: input.activeLocations,
    extraLocations,
    monthlyCents: extraLocations * input.extraLocationPriceCents,
  };
}
