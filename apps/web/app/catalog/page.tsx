import { retireRow, saveProduct, saveService, saveTechnician } from "@/app/catalog/actions";
import { saveOffer } from "@/app/admin/actions";
import { StaffShell } from "@/components/shells";
import { Notice, buttonClass } from "@/components/ui";
import { requireRoles } from "@/lib/auth/session";
import { formatCents } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "Catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; confirm?: string }> }) {
  const params = await searchParams;
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  if (!user.db || !user.tenantId || !user.salon) return null;
  const [services, products, technicians, locations] = await Promise.all([
    user.db.service.findMany({ where: { tenantId: user.tenantId }, include: { locations: true }, orderBy: { sortOrder: "asc" } }),
    user.db.product.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
    user.db.technician.findMany({ where: { tenantId: user.tenantId }, include: { locations: true }, orderBy: { name: "asc" } }),
    user.db.location.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <StaffShell role={user.role} name={user.name} salon={user.salon.name}>
      <p className="text-xs uppercase tracking-[0.18em] text-bark">Catalog</p>
      <h1 className="font-serif text-5xl italic text-wine">Menu, shelf, and team</h1>
      <p className="mt-2 max-w-xl text-sm text-bark">{user.role === "OWNER" ? "You edit the shared menu. Every save is written to the audit log." : "You can change the price, minutes, and availability at your studios. The shared menu is edited by the owner."}</p>
      {params.saved ? <div className="mt-4"><Notice>Saved.</Notice></div> : null}
      {params.error ? <div className="mt-4"><Notice tone="warn">{params.error}</Notice></div> : null}

      {user.role !== "OWNER" ? (
        <section className="mt-8 space-y-4">
          {locations.filter((item) => user.memberships.some((membership) => membership.locationId === item.id)).map((studio) => (
            <div key={studio.id}>
              <h2 className="font-serif text-3xl italic">{studio.name}</h2>
              <ul className="mt-3 space-y-2">
                {services.filter((service) => service.active).map((service) => {
                  const override = service.locations.find((row) => row.locationId === studio.id);
                  return (
                    <li key={service.id}>
                      <form action={saveOffer} className="grid gap-2 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-5 sm:items-end">
                        <input type="hidden" name="serviceId" value={service.id} />
                        <input type="hidden" name="locationId" value={studio.id} />
                        <input type="hidden" name="next" value="/catalog?saved=1" />
                        <p className="text-sm font-medium">{service.name}</p>
                        <label className="text-xs">Price<input name="price" defaultValue={((override?.priceCents ?? service.priceCents) / 100).toFixed(2)} /></label>
                        <label className="text-xs">Minutes<input name="duration" type="number" min={1} defaultValue={override?.durationMin ?? service.durationMin} /></label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="available" defaultChecked={override ? override.available : true} className="h-4 w-4" />Offered</label>
                        <button className={buttonClass("solid")}>Save</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      {user.role === "OWNER" ? <><section className="mt-8 space-y-3">
        <h2 className="font-serif text-3xl italic">Services and add-ons</h2>
        {services.map((service) => (
          <form key={service.id} action={saveService} className="grid gap-2 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-6">
            <input type="hidden" name="id" value={service.id} />
            <label className="text-xs sm:col-span-2">Name<input name="name" defaultValue={service.name} /></label>
            <label className="text-xs">Category<input name="category" defaultValue={service.category} /></label>
            <label className="text-xs">Kind
              <select name="kind" defaultValue={service.kind}><option value="SERVICE">Service</option><option value="ADDON">Add-on</option></select>
            </label>
            <label className="text-xs">Price<input name="price" defaultValue={(service.priceCents / 100).toFixed(2)} /></label>
            <label className="text-xs">Minutes<input name="duration" type="number" min={1} required defaultValue={service.durationMin} /></label>
            <label className="text-xs">Buffer<input name="buffer" type="number" min={0} defaultValue={service.bufferMin} /></label>
            <label className="text-xs sm:col-span-4">Description<input name="description" defaultValue={service.description} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={service.active} className="h-4 w-4" />Offered</label>
            <button className={buttonClass("solid")}>Save</button>
            <div className="flex gap-2 sm:col-span-6">
              <input type="hidden" name="entityType" value="Service" />
              {params.confirm === `off:${service.id}` ? <button formAction={retireRow} name="confirm" value="yes" className={buttonClass("solid")}>Confirm deactivate</button> : <Link href={`/catalog?confirm=off:${service.id}`} className={buttonClass("ghost")}>Deactivate</Link>}
              {params.confirm === `remove:${service.id}` ? <button formAction={retireRow} name="confirm" value="yes" className={buttonClass("solid")}>Confirm remove<input type="hidden" name="remove" value="yes" /></button> : <Link href={`/catalog?confirm=remove:${service.id}`} className={buttonClass("ghost")}>Remove</Link>}
            </div>
          </form>
        ))}
        <form action={saveService} className="grid gap-2 rounded-3xl border border-dashed border-line p-4 sm:grid-cols-6">
          <h3 className="font-medium sm:col-span-6">New service or add-on</h3>
          <input name="name" placeholder="Name" required />
          <input name="category" placeholder="Category" defaultValue="Menu" />
          <select name="kind" defaultValue="SERVICE"><option value="SERVICE">Service</option><option value="ADDON">Add-on</option></select>
          <input name="price" placeholder="25.00" required />
          <input name="duration" type="number" min={1} required defaultValue={30} />
          <input name="buffer" type="number" min={0} defaultValue={0} placeholder="Buffer" />
          <input name="description" placeholder="Description" className="sm:col-span-4" />
          <input type="hidden" name="active" value="on" />
          <button className={buttonClass("solid")}>Add</button>
        </form>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-serif text-3xl italic">Products</h2>
        {products.map((product) => (
          <form key={product.id} action={saveProduct} className="grid gap-2 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-5">
            <input type="hidden" name="id" value={product.id} />
            <label className="text-xs sm:col-span-2">Name<input name="name" defaultValue={product.name} /></label>
            <label className="text-xs">Price<input name="price" defaultValue={(product.priceCents / 100).toFixed(2)} /></label>
            <label className="text-xs">Category
              <select name="category" defaultValue={product.category}><option>POLISH</option><option>CARE</option><option>ART</option><option>TOOLS</option></select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={product.active} className="h-4 w-4" />On the shelf</label>
            <input name="description" defaultValue={product.description} className="sm:col-span-4" />
            <button className={buttonClass("solid")}>Save</button>
            <p className="text-xs text-bark sm:col-span-5">{formatCents(product.priceCents)} catalog price. Stock stays on each studio.</p>
            <input type="hidden" name="entityType" value="Product" />
            {params.confirm === `off:${product.id}` ? <button formAction={retireRow} name="confirm" value="yes" className={buttonClass("solid")}>Confirm deactivate</button> : <Link href={`/catalog?confirm=off:${product.id}`} className={buttonClass("ghost")}>Deactivate</Link>}
          </form>
        ))}
        <form action={saveProduct} className="grid gap-2 rounded-3xl border border-dashed border-line p-4 sm:grid-cols-4">
          <input name="name" placeholder="Product name" required />
          <input name="price" placeholder="12.00" required />
          <select name="category" defaultValue="CARE"><option>POLISH</option><option>CARE</option><option>ART</option><option>TOOLS</option></select>
          <input type="hidden" name="active" value="on" />
          <input name="description" placeholder="Description" className="sm:col-span-3" />
          <button className={buttonClass("solid")}>Add product</button>
        </form>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-serif text-3xl italic">Technicians</h2>
        {technicians.map((tech) => (
          <form key={tech.id} action={saveTechnician} className="grid gap-2 rounded-3xl bg-white p-4 shadow-card">
            <input type="hidden" name="id" value={tech.id} />
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs">Name<input name="name" defaultValue={tech.name} /></label>
              <label className="text-xs">Title<input name="roleTitle" defaultValue={tech.roleTitle} /></label>
              <label className="text-xs">Specialties<input name="specialties" defaultValue={tech.specialties.join(", ")} /></label>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2">
                  <input type="checkbox" name="locationId" value={location.id} defaultChecked={tech.locations.some((row) => row.locationId === location.id && row.active)} className="h-4 w-4" />
                  {location.name}
                </label>
              ))}
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={tech.active} className="h-4 w-4" />Active</label>
            </div>
            <div className="flex gap-2">
              <input type="hidden" name="entityType" value="Technician" />
              <button className={buttonClass("solid")}>Save</button>
              {params.confirm === `off:${tech.id}` ? <button formAction={retireRow} name="confirm" value="yes" className={buttonClass("solid")}>Confirm deactivate</button> : <Link href={`/catalog?confirm=off:${tech.id}`} className={buttonClass("ghost")}>Deactivate</Link>}
            </div>
          </form>
        ))}
        <form action={saveTechnician} className="grid gap-2 rounded-3xl border border-dashed border-line p-4 sm:grid-cols-3">
          <input name="name" placeholder="Name" required />
          <input name="roleTitle" placeholder="Title" defaultValue="Technician" />
          <input name="specialties" placeholder="Gel, art" />
          <input type="hidden" name="active" value="on" />
          <button className={buttonClass("solid")}>Add technician</button>
        </form>
      </section></> : null}
    </StaffShell>
  );
}
