import { CustomerFrame } from "@/components/customer-frame";
import { buttonClass } from "@/components/ui";
import { pricedServices } from "@/lib/offers";
import { formatCents } from "@redlady/core";
import Link from "next/link";
import { getPublicTenant } from "@/lib/tenant";

export default async function HomePage() {
  const tenant = await getPublicTenant();
  if (!tenant) {
    return (
      <CustomerFrame>
        <p />
      </CustomerFrame>
    );
  }
  const [catalog, overrides, products, trends] = await Promise.all([
    tenant.db.service.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { sortOrder: "asc" } }),
    tenant.db.serviceLocation.findMany({ where: { tenantId: tenant.id, locationId: tenant.location.id } }),
    tenant.db.product.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" }, take: 3 }),
    tenant.db.trend.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { rank: "asc" } }),
  ]);
  const services = pricedServices(catalog, overrides).slice(0, 4);

  return (
    <CustomerFrame>
      <section className="overflow-hidden rounded-[2rem] bg-wine px-6 py-10 text-cream shadow-card md:px-10">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Nail studio</p>
        <h1 className="mt-3 max-w-xl font-serif text-5xl italic leading-[0.95] md:text-7xl">{tenant.tagline}</h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-cream/80">{tenant.about}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/book" className={buttonClass("light")}>
            Reserve a chair
          </Link>
          <Link href="/services" className="inline-flex items-center rounded-full border border-white/30 px-4 py-2.5 text-sm">
            View the menu
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {tenant.locations.map((location) => (
          <Link key={location.id} href={`/book?location=${location.slug}`} className="rounded-3xl bg-white p-4 shadow-card">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bark">Studio</p>
            <p className="mt-1 font-medium">{location.name}</p>
            <p className="text-sm text-bark">{location.address}</p>
          </Link>
        ))}
      </section>

      {tenant.campaign?.active ? (
        <section className="mt-6 grid gap-4 rounded-[2rem] bg-white p-6 shadow-card md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-bark">Creator of the month</p>
            <h2 className="mt-2 font-serif text-4xl italic text-wine">{tenant.campaign.title}</h2>
            <p className="mt-2 text-sm text-bark">{tenant.campaign.influencer}</p>
            <p className="mt-3 text-sm leading-6">{tenant.campaign.description}</p>
            <p className="mt-4 text-lg">{formatCents(tenant.campaign.priceCents)}</p>
          </div>
          {tenant.campaign.imageUrl ? (
            <img src={tenant.campaign.imageUrl} alt="" className="h-52 w-full rounded-3xl object-cover" />
          ) : null}
        </section>
      ) : null}

      <section className="mt-10">
        <div className="flex items-end justify-between">
          <h2 className="font-serif text-4xl italic">Services</h2>
          <Link href="/services" className="text-sm text-bark">
            All services
          </Link>
        </div>
        <div className="mt-4 grid gap-3">
          {services.map((service) => (
            <Link key={service.id} href={`/book?service=${service.id}&location=${tenant.location.slug}`} className="rounded-3xl border border-line bg-white p-4">
              <span className="text-[10px] uppercase tracking-[0.16em] text-bark">{service.category}</span>
              <span className="mt-1 flex items-baseline justify-between gap-3">
                <span className="font-medium">{service.name}</span>
                <span>{formatCents(service.priceCents)}</span>
              </span>
              <span className="mt-1 block text-sm text-bark">{service.durationMin} min</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-4xl italic">From the shelf</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {products.map((product) => (
            <Link key={product.id} href="/shop" className="overflow-hidden rounded-3xl bg-white shadow-card">
              {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-36 w-full object-cover" /> : null}
              <span className="block p-4">
                <span className="block font-medium">{product.name}</span>
                <span className="text-sm text-bark">{formatCents(product.priceCents)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {trends.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-4xl italic">On the table this month</h2>
          <ol className="mt-4 space-y-3">
            {trends.map((trend) => (
              <li key={trend.id} className="rounded-3xl border border-line bg-white p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bark">No. {trend.rank}</p>
                <p className="mt-1 font-medium">{trend.title}</p>
                <p className="text-sm text-bark">{trend.description}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-10 text-sm text-bark">
        <p>{tenant.address}</p>
        <p>
          {tenant.phone} · {tenant.email}
        </p>
      </section>
    </CustomerFrame>
  );
}
