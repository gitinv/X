import { setStaffLocation, takePayment, updateVisit } from "@/app/pos/actions";
import { StaffShell } from "@/components/shells";
import { Notice, buttonClass } from "@/components/ui";
import { requireRoles } from "@/lib/auth/session";
import { staffScope } from "@/lib/staff-location";
import { pricedService } from "@/lib/offers";
import { formatCents, formatWhen, isLowStock } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "Front desk" };

export default async function PosPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string }> }) {
  const params = await searchParams;
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  const scope = await staffScope(user, params.tab === "all" ? "all" : undefined);
  const tab = params.tab === "checkout" || params.tab === "inventory" ? params.tab : "schedule";
  const location = scope.current ?? scope.locations[0];
  if (!location || !user.tenantId) {
    return (
      <StaffShell role={user.role} name={user.name} salon={user.salon?.name}>
        <p>No location is assigned to this login.</p>
      </StaffShell>
    );
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
  const [visits, technicians, stock, overrides] = await Promise.all([
    scope.db.appointment.findMany({
      where: { tenantId: user.tenantId, locationId: location.id, startAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
      include: { client: true, service: true, technician: true },
      orderBy: { startAt: "asc" },
    }),
    scope.db.technician.findMany({
      where: { tenantId: user.tenantId, active: true, locations: { some: { locationId: location.id, active: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    scope.db.locationStock.findMany({ where: { tenantId: user.tenantId, locationId: location.id }, include: { product: true }, orderBy: { product: { name: "asc" } } }),
    scope.db.serviceLocation.findMany({ where: { tenantId: user.tenantId, locationId: location.id } }),
  ]);
  const visitPrice = (service: { id: string; priceCents: number; durationMin: number }) =>
    pricedService(service, overrides.find((override) => override.serviceId === service.id))?.priceCents ?? service.priceCents;
  const low = stock.filter((row) => row.product.active && isLowStock(row.stock, row.lowStockAlert));

  return (
    <StaffShell role={user.role} name={user.name} salon={`${user.salon?.name ?? ""} · ${location.name}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-bark">Front desk</p>
          <h1 className="font-serif text-5xl italic text-wine">{location.name}</h1>
        </div>
        <form action={setStaffLocation} className="flex items-center gap-2">
          <input type="hidden" name="next" value={`/pos?tab=${tab}`} />
          <select name="location" defaultValue={location.slug} className="w-auto">
            {scope.locations.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <button className={buttonClass("ghost")}>Switch</button>
        </form>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto text-sm">
        {[
          ["schedule", "Today"],
          ["checkout", "Checkout"],
          ["inventory", "Inventory"],
        ].map(([id, label]) => (
          <Link key={id} href={`/pos?tab=${id}`} className={buttonClass(tab === id ? "solid" : "ghost")}>
            {label}
          </Link>
        ))}
      </div>
      {low.length > 0 && tab !== "inventory" ? (
        <div className="mt-4">
          <Notice tone="warn">{low.length} product{low.length === 1 ? "" : "s"} at or below the alert level at {location.name}.</Notice>
        </div>
      ) : null}
      {params.saved ? (
        <div className="mt-4">
          <Notice>Payment saved.</Notice>
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-4">
          <Notice tone="warn">{params.error}</Notice>
        </div>
      ) : null}

      {tab === "schedule" ? (
        <ul className="mt-6 space-y-3">
          {visits.map((visit) => (
            <li key={visit.id} className="rounded-3xl bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{visit.client.name}</p>
                <p className="text-sm text-bark">{formatWhen(visit.startAt, location.timezone)}</p>
              </div>
              <p className="text-sm text-bark">
                {visit.service.name} · {visit.technician.name} · {visit.status.replaceAll("_", " ")}
              </p>
              {!visit.client.photoConsentAt && user.salon?.photoConsentRequired ? <p className="mt-2 text-sm text-wine">Service photos are blocked until this guest agrees.</p> : null}
              <form action={updateVisit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <input type="hidden" name="id" value={visit.id} />
                <select name="technicianId" defaultValue={visit.technicianId}>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="consent" className="h-4 w-4" />
                  Photo consent
                </label>
                <div className="flex flex-wrap gap-2">
                  {visit.status === "BOOKED" ? (
                    <button name="status" value="CHECKED_IN" className={buttonClass("solid")}>
                      Check in
                    </button>
                  ) : null}
                  {visit.status === "CHECKED_IN" ? (
                    <button name="status" value="IN_SERVICE" className={buttonClass("solid")}>
                      Start
                    </button>
                  ) : null}
                  <button className={buttonClass("ghost")}>Save tech</button>
                </div>
              </form>
            </li>
          ))}
          {visits.length === 0 ? <li className="text-sm text-bark">No one on the book for this stretch.</li> : null}
        </ul>
      ) : null}

      {tab === "checkout" ? (
        <form action={takePayment} className="mt-6 space-y-4 rounded-3xl bg-white p-4 shadow-card">
          <input type="hidden" name="locationId" value={location.id} />
          <label className="block text-sm">
            <span className="mb-1 block text-bark">Visit</span>
            <select name="appointmentId" defaultValue="">
              <option value="">Retail only</option>
              {visits
                .filter((visit) => visit.paymentStatus !== "PAID")
                .map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visit.client.name} · {visit.service.name} · {formatCents(visitPrice(visit.service))}
                  </option>
                ))}
            </select>
          </label>
          <div className="space-y-2">
            {stock
              .filter((row) => row.product.active)
              .map((row) => (
                <label key={row.id} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
                  <span>
                    {row.product.name} · {formatCents(row.product.priceCents)} · {row.stock} on hand
                  </span>
                  <input name={`qty_${row.productId}`} type="number" min={0} max={row.stock} defaultValue={0} />
                </label>
              ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-bark">Payment</span>
            <select name="paymentMethod" defaultValue="CARD">
              <option value="CARD">Card</option>
              <option value="TAP">Tap</option>
              <option value="CASH">Cash</option>
            </select>
          </label>
          <button className={buttonClass("solid")}>Take payment</button>
        </form>
      ) : null}

      {tab === "inventory" ? (
        <ul className="mt-6 space-y-2">
          {stock.map((row) => (
            <li key={row.id} className={`rounded-2xl border px-4 py-3 ${isLowStock(row.stock, row.lowStockAlert) ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
              <span className="font-medium">{row.product.name}</span>
              <span className="mt-1 block text-sm text-bark">
                {row.stock} on hand · alert at {row.lowStockAlert}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </StaffShell>
  );
}
