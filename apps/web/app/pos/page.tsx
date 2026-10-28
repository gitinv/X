import { cancelFromDesk, refundFromDesk, rescheduleFromDesk, setStaffLocation, takePayment, updateVisit } from "@/app/pos/actions";
import { StaffShell } from "@/components/shells";
import { TicketForm } from "@/components/ticket-form";
import { Notice, buttonClass } from "@/components/ui";
import { pricedService } from "@/lib/offers";
import { requireRoles } from "@/lib/auth/session";
import { staffScope } from "@/lib/staff-location";
import { favoriteCardClass, favoriteNote, formatCents, formatDateTimeLocal, formatTime, formatWhen, isLowStock, reservedMinutes } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "Front desk" };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; error?: string; q?: string; visit?: string; confirm?: string; move?: string; client?: string; match?: string; service?: string | string[]; tech?: string; start?: string; force?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRoles(["FRONT_DESK", "MANAGER", "OWNER"]);
  const scope = await staffScope(user);
  const tab = params.tab === "ticket" || params.tab === "checkout" || params.tab === "inventory" || params.tab === "clients" ? params.tab : "schedule";
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
  const [visits, technicians, stock, overrides, catalog, clients, recentOrders] = await Promise.all([
    scope.db.appointment.findMany({
      where: { tenantId: user.tenantId, locationId: location.id, startAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
      include: { client: { include: { favorites: true } }, service: true, technician: true, lines: { orderBy: { sortOrder: "asc" } } },
      orderBy: { startAt: "asc" },
    }),
    scope.db.technician.findMany({
      where: { tenantId: user.tenantId, active: true, locations: { some: { locationId: location.id, active: true } } },
      orderBy: { name: "asc" },
    }),
    scope.db.locationStock.findMany({ where: { tenantId: user.tenantId, locationId: location.id }, include: { product: true }, orderBy: { product: { name: "asc" } } }),
    scope.db.serviceLocation.findMany({ where: { tenantId: user.tenantId, locationId: location.id } }),
    scope.db.service.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { sortOrder: "asc" } }),
    tab === "clients" || params.client
      ? scope.db.client.findMany({
          where: {
            tenantId: user.tenantId,
            ...(params.q
              ? { OR: [{ name: { contains: params.q, mode: "insensitive" } }, { phone: { contains: params.q, mode: "insensitive" } }, { email: { contains: params.q, mode: "insensitive" } }] }
              : {}),
          },
          include: { favorites: true },
          orderBy: { name: "asc" },
          take: 40,
        })
      : Promise.resolve([]),
    tab === "checkout"
      ? scope.db.order.findMany({
          where: { tenantId: user.tenantId, locationId: location.id, createdAt: { gte: dayStart } },
          include: { refunds: true, client: true },
          orderBy: { createdAt: "desc" },
          take: 12,
        })
      : Promise.resolve([]),
  ]);
  const low = stock.filter((row) => row.product.active && isLowStock(row.stock, row.lowStockAlert));
  const tiles = catalog.flatMap((service) => {
    const priced = pricedService(service, overrides.find((override) => override.serviceId === service.id));
    return priced ? [{ id: service.id, name: service.name, priceCents: priced.priceCents, durationMin: priced.durationMin, kind: service.kind }] : [];
  });
  const editing = visits.find((visit) => visit.id === params.visit);
  const ticketClient = params.client ? clients.find((client) => client.id === params.client) ?? (await scope.db.client.findFirst({ where: { id: params.client, tenantId: user.tenantId }, include: { favorites: true } })) : editing?.client ?? null;
  const favoriteIds = ticketClient && "favorites" in ticketClient ? ticketClient.favorites.map((favorite) => favorite.technicianId) : [];

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
              <option key={item.id} value={item.slug}>{item.name}</option>
            ))}
          </select>
          <button className={buttonClass("ghost")}>Switch</button>
        </form>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto text-sm">
        {[["schedule", "Today"], ["ticket", "Ticket"], ["clients", "Clients"], ["checkout", "Checkout"], ["inventory", "Inventory"]].map(([id, label]) => (
          <Link key={id} href={`/pos?tab=${id}`} className={buttonClass(tab === id ? "solid" : "ghost")}>{label}</Link>
        ))}
      </div>
      {low.length > 0 && tab !== "inventory" ? <div className="mt-4"><Notice tone="warn">{low.length} product{low.length === 1 ? "" : "s"} at or below the alert level at {location.name}.</Notice></div> : null}
      {params.saved ? <div className="mt-4"><Notice>Saved.</Notice></div> : null}
      {params.error ? <div className="mt-4"><Notice tone="warn">{params.error}</Notice></div> : null}

      {tab === "schedule" ? (
        <ul className="mt-6 space-y-3">
          {visits.map((visit) => {
            const names = technicians.filter((tech) => visit.client.favorites.some((favorite) => favorite.technicianId === tech.id)).map((tech) => tech.name);
            const note = favoriteNote(visit.client.name, names);
            const moving = params.move === visit.id;
            const confirming = params.confirm === visit.id;
            return (
              <li key={visit.id} className="rounded-3xl bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{visit.client.name}</p>
                    <p className="text-sm text-bark">{formatWhen(visit.startAt, location.timezone)} · {visit.technician.name}</p>
                    <p className="mt-1 text-sm">{visit.lines.length ? visit.lines.map((line) => line.name).join(" · ") : visit.service.name}</p>
                    <p className="text-sm text-bark">{formatTime(visit.startAt, location.timezone)}–{formatTime(visit.endAt, location.timezone)} · {visit.lines.reduce((sum, line) => sum + reservedMinutes(line), 0) || Math.round((visit.endAt.getTime() - visit.startAt.getTime()) / 60000)} min</p>
                    {note ? <p className="mt-2 text-sm text-ink"><span className="text-gold">★</span> {note}</p> : null}
                    {!visit.client.photoConsentAt && user.salon?.photoConsentRequired ? <p className="mt-2 text-sm text-wine">Service photos are blocked until this guest agrees.</p> : null}
                  </div>
                  <span className="text-xs uppercase tracking-[0.14em] text-bark">{visit.status.replaceAll("_", " ")}</span>
                </div>
                <form action={updateVisit} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={visit.id} />
                  <input type="hidden" name="next" value="/pos" />
                  <select name="technicianId" defaultValue={visit.technicianId} className="w-auto">
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>{visit.client.favorites.some((favorite) => favorite.technicianId === tech.id) ? `★ ${tech.name}` : tech.name}</option>
                    ))}
                  </select>
                  <button className={buttonClass("ghost")}>Save tech</button>
                  {visit.status === "BOOKED" ? <button name="status" value="CHECKED_IN" className={buttonClass("solid")}>Check in</button> : null}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" className="h-4 w-4" />Photo consent</label>
                </form>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/pos?tab=ticket&visit=${visit.id}`} className={buttonClass("ghost")}>Edit ticket</Link>
                  <Link href={`/pos?move=${visit.id}`} className={buttonClass("ghost")}>Reschedule</Link>
                  <Link href={`/pos?confirm=${visit.id}`} className={buttonClass("ghost")}>Cancel</Link>
                </div>
                {moving ? (
                  <form action={rescheduleFromDesk} className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-cream p-3">
                    <input type="hidden" name="id" value={visit.id} />
                    <input type="hidden" name="confirm" value="yes" />
                    <label className="text-sm">New time<input type="datetime-local" name="start" required /></label>
                    <button className={buttonClass("solid")}>Confirm new time</button>
                  </form>
                ) : null}
                {confirming ? (
                  <form action={cancelFromDesk} className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-cream p-3">
                    <input type="hidden" name="id" value={visit.id} />
                    <input type="hidden" name="confirm" value="yes" />
                    <p className="text-sm">Cancel this visit, even inside the usual window?</p>
                    <button className={buttonClass("solid")}>Confirm cancel</button>
                  </form>
                ) : null}
              </li>
            );
          })}
          {visits.length === 0 ? <li className="text-sm text-bark">No one on the book for this stretch.</li> : null}
        </ul>
      ) : null}

      {tab === "ticket" ? (
        <div className="mt-6 space-y-4">
          {params.match ? (
            <Notice>
              That phone or email is already a client.{" "}
              <Link href={`/pos?tab=ticket&client=${params.match}${params.tech ? `&tech=${params.tech}` : ""}${params.start ? `&start=${encodeURIComponent(params.start)}` : ""}${[params.service].flat().filter(Boolean).map((id) => `&service=${id}`).join("")}`} className="underline">Use this profile</Link>
              {" "}or{" "}
              <Link href={`/pos?tab=ticket&force=1${params.tech ? `&tech=${params.tech}` : ""}${params.start ? `&start=${encodeURIComponent(params.start)}` : ""}${[params.service].flat().filter(Boolean).map((id) => `&service=${id}`).join("")}`} className="underline">Create a separate profile</Link>.
            </Notice>
          ) : null}
          <TicketForm
            locationId={location.id}
            appointmentId={editing?.id}
            services={tiles.filter((item) => item.kind === "SERVICE")}
            addons={tiles.filter((item) => item.kind === "ADDON")}
            technicians={technicians.map((tech) => ({ id: tech.id, name: tech.name }))}
            favoriteIds={favoriteIds}
            initialServiceIds={editing?.lines.map((line) => line.serviceId) ?? [params.service].flat().filter((id): id is string => Boolean(id))}
            initialTechnicianId={editing?.technicianId ?? params.tech}
            initialStart={editing ? formatDateTimeLocal(editing.startAt, location.timezone) : params.start}
            forceNew={params.force === "1"}
            client={params.force === "1" ? null : ticketClient ? { id: ticketClient.id, name: ticketClient.name } : null}
          />
        </div>
      ) : null}

      {tab === "clients" ? (
        <div className="mt-6 space-y-4">
          <form className="flex gap-2">
            <input type="hidden" name="tab" value="clients" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Name, phone, or email" />
            <button className={buttonClass("solid")}>Search</button>
          </form>
          <ul className="space-y-2">
            {clients.map((client) => {
              const names = technicians.filter((tech) => client.favorites.some((favorite) => favorite.technicianId === tech.id)).map((tech) => tech.name);
              const note = favoriteNote(client.name, names);
              return (
                <li key={client.id} className={`rounded-3xl p-4 ${note ? favoriteCardClass(true) : "border border-line bg-white"}`}>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-bark">{client.phone || "No phone"} · {client.email || "No email"}</p>
                  {note ? <p className="mt-1 text-sm"><span className="text-gold">★</span> {note}</p> : null}
                  <Link href={`/pos?tab=ticket&client=${client.id}`} className={`${buttonClass("ghost")} mt-3`}>New ticket</Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "checkout" ? (
        <div className="mt-6 space-y-6">
          <form action={takePayment} className="space-y-4 rounded-3xl bg-white p-4 shadow-card">
            <input type="hidden" name="locationId" value={location.id} />
            <label className="block text-sm">
              <span className="mb-1 block text-bark">Visit</span>
              <select name="appointmentId" defaultValue="">
                <option value="">Retail only</option>
                {visits.filter((visit) => visit.paymentStatus !== "PAID" && visit.paymentStatus !== "REFUNDED").map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visit.client.name} · {(visit.lines.length ? visit.lines.map((line) => line.name).join(", ") : visit.service.name)} · {formatCents(visit.lines.reduce((sum, line) => sum + line.priceCents, 0) || visit.service.priceCents)}
                    {visit.status === "READY" ? " · ready" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              {stock.filter((row) => row.product.active).map((row) => (
                <label key={row.id} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
                  <span>{row.product.name} · {formatCents(row.product.priceCents)} · {row.stock} on hand</span>
                  <input name={`qty_${row.productId}`} type="number" min={0} max={row.stock} defaultValue={0} />
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-sm">Tip $<input name="tip" type="number" min={0} step="0.01" defaultValue={0} /></label>
              <label className="text-sm">Discount<input name="discount" type="number" min={0} step="0.01" defaultValue={0} /></label>
              <label className="text-sm">Discount type
                <select name="discountMode" defaultValue="amount"><option value="amount">Dollars</option><option value="percent">Percent</option></select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-bark">Payment</span>
              <select name="paymentMethod" defaultValue="CARD"><option value="CARD">Card</option><option value="TAP">Tap</option><option value="CASH">Cash</option></select>
            </label>
            <button className={buttonClass("solid")}>Take payment</button>
          </form>
          <ul className="space-y-2">
            {recentOrders.map((order) => {
              const refunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
              return (
                <li key={order.id} className="rounded-3xl bg-white p-4 text-sm shadow-card">
                  <p className="font-medium">{order.client?.name ?? "Retail"} · {formatCents(order.totalCents)}</p>
                  <p className="text-bark">Tip {formatCents(order.tipCents)} · discount {formatCents(order.discountCents)} · refunded {formatCents(refunded)}</p>
                  {refunded < order.totalCents ? (
                    <form action={refundFromDesk} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <label className="text-xs">Refund $<input name="amount" type="number" min={0.01} step="0.01" required /></label>
                      <label className="text-xs">Reason<input name="reason" required /></label>
                      <button className={buttonClass("ghost")}>Refund</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <ul className="mt-6 space-y-2">
          {stock.map((row) => (
            <li key={row.id} className={`rounded-2xl border px-4 py-3 ${isLowStock(row.stock, row.lowStockAlert) ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
              <span className="font-medium">{row.product.name}</span>
              <span className="mt-1 block text-sm text-bark">{row.stock} on hand · alert at {row.lowStockAlert}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </StaffShell>
  );
}
