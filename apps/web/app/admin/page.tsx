import { assignStaff, saveBranding, saveHours, saveLocation, saveOffer, saveTechLocations, setLocationActive, softDeletePhoto } from "@/app/admin/actions";
import { setStaffLocation } from "@/app/pos/actions";
import { StaffShell } from "@/components/shells";
import { Notice, buttonClass } from "@/components/ui";
import { requireRoles } from "@/lib/auth/session";
import { createDownloadUrl } from "@/lib/photos/storage";
import { staffScope } from "@/lib/staff-location";
import { formatCents, formatClock, locationCharge } from "@redlady/core";
import { platform } from "@redlady/db";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Owner portal" };

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string; at?: string }> }) {
  const params = await searchParams;
  const user = await requireRoles(["OWNER", "MANAGER"]);
  const scope = await staffScope(user, params.at);
  const tab = params.tab || (scope.all ? "reports" : "locations");
  if (!user.db || !user.tenantId || !user.salon) redirect("/login");
  const location = scope.current;
  const registry = await platform.tenant.findUnique({ where: { id: user.tenantId } });
  const activeLocations = await user.db.location.count({ where: { tenantId: user.tenantId, active: true } });
  const charge = locationCharge({
    activeLocations,
    includedLocations: registry?.includedLocations ?? 1,
    extraLocationPriceCents: registry?.extraLocationPriceCents ?? 0,
  });
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const orders = await user.db.order.findMany({
    where: { tenantId: user.tenantId, createdAt: { gte: since }, ...(location ? { locationId: location.id } : {}) },
    include: { location: true },
  });
  const total = orders.reduce((sum, order) => sum + order.totalCents, 0);
  const services = tab === "catalog" ? await user.db.service.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { sortOrder: "asc" } }) : [];
  const technicians = tab === "team" ? await user.db.technician.findMany({ where: { tenantId: user.tenantId }, include: { locations: true }, orderBy: { sortOrder: "asc" } }) : [];
  const hours = location ? await user.db.businessHour.findMany({ where: { locationId: location.id }, orderBy: { dayOfWeek: "asc" } }) : [];
  const photos =
    tab === "photos"
      ? await user.db.servicePhoto.findMany({
          where: { tenantId: user.tenantId, deletedAt: null, ...(location ? { appointment: { locationId: location.id } } : {}) },
          include: { client: true, service: true, appointment: { include: { location: true } } },
          orderBy: { takenAt: "desc" },
          take: 24,
        })
      : [];
  const thumbs = await Promise.all(photos.map(async (photo) => ({ ...photo, src: await createDownloadUrl(photo.thumbKey) })));

  return (
    <StaffShell role={user.role} name={user.name} salon={user.salon.name}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-bark">Owner portal</p>
          <h1 className="font-serif text-5xl italic text-wine">{scope.all ? "All locations" : location?.name}</h1>
        </div>
        <form action={setStaffLocation} className="flex items-center gap-2">
          <input type="hidden" name="next" value={`/admin?tab=${tab}`} />
          <select name="location" defaultValue={scope.all ? "all" : location?.slug} className="w-auto">
            {user.role === "OWNER" ? <option value="all">All locations</option> : null}
            {scope.locations.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <button className={buttonClass("ghost")}>Switch</button>
        </form>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {["reports", "locations", "hours", "catalog", "team", "photos", "branding"].map((id) => (
          <Link key={id} href={`/admin?tab=${id}${scope.all ? "&at=all" : ""}`} className={buttonClass(tab === id ? "solid" : "ghost")}>
            {id}
          </Link>
        ))}
      </div>
      {params.saved ? <div className="mt-4"><Notice>Saved.</Notice></div> : null}
      {params.error ? <div className="mt-4"><Notice tone="warn">{params.error}</Notice></div> : null}

      {tab === "reports" ? (
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <article className="rounded-3xl bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-bark">Today</p>
            <p className="mt-2 font-serif text-4xl">{formatCents(total)}</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-bark">Tickets</p>
            <p className="mt-2 font-serif text-4xl">{orders.length}</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-bark">Locations</p>
            <p className="mt-2 font-serif text-4xl">{activeLocations}</p>
            <p className="text-sm text-bark">{charge.extraLocations} above the plan · {formatCents(charge.monthlyCents)} hook, not charged</p>
          </article>
        </section>
      ) : null}

      {tab === "locations" ? (
        <div className="mt-6 space-y-4">
          {scope.locations.map((item) => (
            <form key={item.id} action={saveLocation} className="grid gap-3 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-2">
              <input type="hidden" name="id" value={item.id} />
              <label className="text-sm">Name<input name="name" defaultValue={item.name} /></label>
              <label className="text-sm">Phone<input name="phone" defaultValue={item.phone} /></label>
              <label className="text-sm sm:col-span-2">Address<input name="address" defaultValue={item.address} /></label>
              <label className="text-sm">Timezone<input name="timezone" defaultValue={item.timezone} /></label>
              <label className="text-sm">Brand color<input name="brandColor" defaultValue={item.brandColor ?? ""} placeholder="#7A1F2B" /></label>
              <label className="text-sm">Subdomain<input name="subdomain" defaultValue={item.subdomain ?? ""} /></label>
              <label className="text-sm">Custom domain<input name="customDomain" defaultValue={item.customDomain ?? ""} /></label>
              <div className="flex gap-2 sm:col-span-2">
                <button className={buttonClass("solid")}>Save location</button>
                {user.role === "OWNER" ? (
                  <button formAction={setLocationActive} name="active" value="false" className={buttonClass("ghost")}>
                    Deactivate
                  </button>
                ) : null}
              </div>
            </form>
          ))}
          {user.role === "OWNER" ? (
            <form action={saveLocation} className="grid gap-3 rounded-3xl border border-dashed border-line p-4 sm:grid-cols-2">
              <h2 className="font-serif text-3xl italic sm:col-span-2">Add a location</h2>
              <label className="text-sm">Name<input name="name" required /></label>
              <label className="text-sm">Phone<input name="phone" /></label>
              <label className="text-sm sm:col-span-2">Address<input name="address" /></label>
              <label className="text-sm">Timezone<input name="timezone" defaultValue={user.salon.timezone} /></label>
              <button className={buttonClass("solid")}>Add location</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "hours" && location ? (
        <form action={saveHours} className="mt-6 space-y-2 rounded-3xl bg-white p-4 shadow-card">
          <input type="hidden" name="locationId" value={location.id} />
          {days.map((day, index) => {
            const row = hours.find((hour) => hour.dayOfWeek === index);
            return (
              <div key={day} className="grid grid-cols-[4rem_1fr_1fr_auto] items-center gap-2 text-sm">
                <span>{day}</span>
                <input type="time" name={`open_${index}`} defaultValue={formatClock(row?.openMin ?? 9 * 60)} />
                <input type="time" name={`close_${index}`} defaultValue={formatClock(row?.closeMin ?? 19 * 60)} />
                <label className="flex items-center gap-1">
                  <input type="checkbox" name={`closed_${index}`} defaultChecked={row?.closed ?? false} className="h-4 w-4" />
                  Closed
                </label>
              </div>
            );
          })}
          <button className={buttonClass("solid")}>Save hours</button>
        </form>
      ) : null}

      {tab === "catalog" && location ? (
        <ul className="mt-6 space-y-3">
          {services.map((service) => (
            <li key={service.id}>
              <form action={saveOffer} className="grid gap-2 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-[1.4fr_8rem_6rem_auto_auto] sm:items-end">
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="locationId" value={location.id} />
                <p className="text-sm font-medium">{service.name}<span className="block text-bark">Catalog {formatCents(service.priceCents)} · {service.durationMin} min</span></p>
                <label className="text-xs text-bark">Price override<input name="price" placeholder="45.00" /></label>
                <label className="text-xs text-bark">Minutes<input name="duration" placeholder={String(service.durationMin)} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="available" defaultChecked className="h-4 w-4" />Offered</label>
                <button className={buttonClass("solid")}>Save</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "team" ? (
        <div className="mt-6 space-y-4">
          {technicians.map((tech) => (
            <form key={tech.id} action={saveTechLocations} className="rounded-3xl bg-white p-4 shadow-card">
              <input type="hidden" name="technicianId" value={tech.id} />
              <p className="font-medium">{tech.name}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {scope.locations.map((item) => (
                  <label key={item.id} className="flex items-center gap-2">
                    <input type="checkbox" name="locationId" value={item.id} defaultChecked={tech.locations.some((row) => row.locationId === item.id && row.active)} className="h-4 w-4" />
                    {item.name}
                  </label>
                ))}
              </div>
              {user.role === "OWNER" ? <button className={`${buttonClass("ghost")} mt-3`}>Save studios</button> : null}
            </form>
          ))}
          {user.role === "OWNER" && location ? (
            <form action={assignStaff} className="grid gap-2 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-4">
              <input name="email" type="email" placeholder="staff email" required />
              <input type="hidden" name="locationId" value={location.id} />
              <select name="role" defaultValue="MANAGER">
                <option value="MANAGER">Manager</option>
                <option value="FRONT_DESK">Front desk</option>
                <option value="TECHNICIAN">Technician</option>
              </select>
              <button className={buttonClass("solid")}>Grant {location.name}</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "photos" ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {thumbs.map((photo) => (
            <li key={photo.id} className="overflow-hidden rounded-3xl bg-white shadow-card">
              <img src={photo.src} alt="" className="h-40 w-full object-cover" />
              <div className="p-3 text-sm">
                <p className="font-medium">{photo.client.name}</p>
                <p className="text-bark">{photo.service.name} · {photo.appointment.location.name} · {photo.label.toLowerCase()}</p>
                {user.role === "OWNER" ? (
                  <form action={softDeletePhoto} className="mt-2">
                    <input type="hidden" name="id" value={photo.id} />
                    <button className={buttonClass("ghost")}>Remove from view</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {thumbs.length === 0 ? <li className="text-sm text-bark">No service photos in this view yet.</li> : null}
        </ul>
      ) : null}

      {tab === "branding" && user.role === "OWNER" ? (
        <form action={saveBranding} className="mt-6 space-y-3 rounded-3xl bg-white p-4 shadow-card">
          <label className="block text-sm">Salon name<input name="name" defaultValue={user.salon.name} /></label>
          <label className="block text-sm">Tagline<input name="tagline" defaultValue={user.salon.tagline} /></label>
          <label className="block text-sm">About<textarea name="about" rows={4} defaultValue={user.salon.about} /></label>
          <label className="block text-sm">Brand color<input name="brandColor" defaultValue={user.salon.brandColor} /></label>
          <label className="block text-sm">Cancellation window (hours)<input name="cancellationWindowHours" defaultValue={user.salon.cancellationWindowHours} /></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="photoConsentRequired" defaultChecked={user.salon.photoConsentRequired} className="h-4 w-4" />
            Require photo consent before capture
          </label>
          <button className={buttonClass("solid")}>Save branding</button>
          <p className="text-sm text-bark">Customers and staff can install this salon: iPhone Share → Add to Home Screen. Android browser menu → Install app or Add to Home screen.</p>
        </form>
      ) : null}
    </StaffShell>
  );
}
