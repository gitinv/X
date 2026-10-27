import { CustomerFrame } from "@/components/customer-frame";
import { pricedServices } from "@/lib/offers";
import { formatCents } from "@redlady/core";
import Link from "next/link";
import { getPublicTenant } from "@/lib/tenant";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const tenant = await getPublicTenant();
  const catalog = tenant
    ? await tenant.db.service.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { sortOrder: "asc" } })
    : [];
  const overrides = tenant
    ? await tenant.db.serviceLocation.findMany({ where: { tenantId: tenant.id, locationId: tenant.location.id } })
    : [];
  const services = pricedServices(catalog, overrides);
  const categories = [...new Set(services.map((service) => service.category))];
  return (
    <CustomerFrame>
      <h1 className="font-serif text-5xl italic text-wine">The menu</h1>
      <p className="mt-2 text-sm text-bark">Prices and times at {tenant?.location.name ?? "this studio"}.</p>
      <div className="mt-8 space-y-8">
        {categories.map((category) => (
          <section key={category}>
            <h2 className="text-xs uppercase tracking-[0.18em] text-bark">{category}</h2>
            <div className="mt-3 space-y-3">
              {services
                .filter((service) => service.category === category)
                .map((service) => (
                  <Link key={service.id} href={`/book?service=${service.id}${tenant ? `&location=${tenant.location.slug}` : ""}`} className="block rounded-3xl bg-white p-4 shadow-card">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{service.name}</span>
                      <span>{formatCents(service.priceCents)}</span>
                    </span>
                    <span className="mt-1 block text-sm text-bark">
                      {service.durationMin} min · {service.description}
                    </span>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </CustomerFrame>
  );
}
