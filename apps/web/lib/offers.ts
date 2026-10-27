import { effectiveOffer } from "@redlady/core";

export interface ServiceOverride {
  serviceId: string;
  available: boolean;
  priceCents: number | null;
  durationMin: number | null;
}

export function pricedService<T extends { id: string; priceCents: number; durationMin: number }>(service: T, override?: ServiceOverride | null) {
  const priced = effectiveOffer(service, override);
  if (!priced) return null;
  return { ...service, priceCents: priced.priceCents, durationMin: priced.durationMin };
}

export function pricedServices<T extends { id: string; priceCents: number; durationMin: number }>(services: T[], overrides: ServiceOverride[]) {
  return services.flatMap((service) => {
    const next = pricedService(
      service,
      overrides.find((override) => override.serviceId === service.id),
    );
    return next ? [next] : [];
  });
}
