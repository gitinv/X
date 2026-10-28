import { BookingWizard } from "@/components/booking-wizard";
import { CustomerFrame } from "@/components/customer-frame";
import { getSession } from "@/lib/auth/session";
import { LOCATION_COOKIE, getPublicTenant, parseNear } from "@/lib/tenant";
import { zonedDayKey } from "@redlady/core";
import { cookies } from "next/headers";

export const metadata = { title: "Book" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; services?: string; tech?: string; location?: string; near?: string; date?: string }>;
}) {
  const params = await searchParams;
  const jar = await cookies();
  const hasCookie = Boolean(jar.get(LOCATION_COOKIE)?.value);
  const salon = await getPublicTenant({ locationSlug: params.location, near: params.location ? null : parseNear(params.near) });
  const session = await getSession();
  if (!salon) {
    return (
      <CustomerFrame>
        <p />
      </CustomerFrame>
    );
  }
  const [services, technicians, client, offers] = await Promise.all([
    salon.db.service.findMany({ where: { tenantId: salon.id, active: true }, orderBy: { sortOrder: "asc" } }),
    salon.db.technician.findMany({
      where: { tenantId: salon.id, active: true },
      include: { locations: true },
      orderBy: { sortOrder: "asc" },
    }),
    session?.clientId ? salon.db.client.findFirst({ where: { id: session.clientId, tenantId: salon.id }, include: { favorites: true } }) : Promise.resolve(null),
    salon.db.serviceLocation.findMany({ where: { tenantId: salon.id } }),
  ]);
  const today = zonedDayKey(new Date(), salon.location.timezone);
  const requestedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  return (
    <CustomerFrame>
      <BookingWizard
        services={services.map((service) => ({
          id: service.id,
          category: service.category,
          name: service.name,
          description: service.description,
          kind: service.kind,
          durationMin: service.durationMin,
          bufferMin: service.bufferMin,
          priceCents: service.priceCents,
        }))}
        technicians={technicians.map((technician) => ({
          id: technician.id,
          name: technician.name,
          roleTitle: technician.roleTitle,
          specialties: technician.specialties,
          avatarUrl: technician.avatarUrl,
          locationIds: technician.locations.filter((row) => row.active).map((row) => row.locationId),
        }))}
        locations={salon.locations.map((location) => ({
          id: location.id,
          slug: location.slug,
          name: location.name,
          address: location.address,
          timezone: location.timezone,
          hours: location.hours.map((row) => ({ dayOfWeek: row.dayOfWeek, openMin: row.openMin, closeMin: row.closeMin, closed: row.closed })),
        }))}
        offers={offers.map((offer) => ({
          locationId: offer.locationId,
          serviceId: offer.serviceId,
          available: offer.available,
          priceCents: offer.priceCents,
          durationMin: offer.durationMin,
          bufferMin: offer.bufferMin,
        }))}
        initialDate={requestedDate}
        today={today}
        presetServiceIds={(params.services ?? params.service ?? "").split(",").map((id) => id.trim()).filter(Boolean)}
        presetTechnicianId={params.tech}
        presetLocationSlug={salon.location.slug}
        suggestNearest={!params.location && !params.near && !hasCookie && !client?.lastLocationId}
        account={client ? { name: client.name, phone: client.phone ?? "", email: client.email ?? "" } : null}
        favoriteIds={client?.favorites.map((favorite) => favorite.technicianId) ?? []}
        signedIn={Boolean(client)}
      />
    </CustomerFrame>
  );
}
