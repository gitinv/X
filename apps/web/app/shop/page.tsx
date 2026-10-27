import { CustomerFrame } from "@/components/customer-frame";
import { formatCents } from "@redlady/core";
import { getPublicTenant } from "@/lib/tenant";

export const metadata = { title: "Shop" };

export default async function ShopPage() {
  const tenant = await getPublicTenant();
  const products = tenant
    ? await tenant.db.product.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } })
    : [];
  return (
    <CustomerFrame>
      <h1 className="font-serif text-5xl italic text-wine">Take a bottle home</h1>
      <p className="mt-2 text-sm text-bark">Ask the front desk to add these to your ticket.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {products.map((product) => (
          <article key={product.id} className="overflow-hidden rounded-[1.5rem] bg-white shadow-card">
            {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-44 w-full object-cover" /> : null}
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bark">{product.category.toLowerCase()}</p>
              <h2 className="mt-1 text-lg font-medium">{product.name}</h2>
              <p className="mt-1 text-sm text-bark">{product.description}</p>
              <p className="mt-3">{formatCents(product.priceCents)}</p>
            </div>
          </article>
        ))}
      </div>
    </CustomerFrame>
  );
}
