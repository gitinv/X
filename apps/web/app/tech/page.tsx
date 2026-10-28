import { setStaffLocation, updateVisit } from "@/app/pos/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { PhotoCapture } from "@/components/photo-capture";
import { StaffShell } from "@/components/shells";
import { favoriteCardClass } from "@/components/favorite-mark";
import { buttonClass } from "@/components/ui";
import { requireRoles } from "@/lib/auth/session";
import { staffScope } from "@/lib/staff-location";
import { buildTurnBoard, canCaptureServicePhoto, favoriteNote, formatWhen } from "@redlady/core";

export const metadata = { title: "Tech screen" };

export default async function TechPage() {
  const user = await requireRoles(["TECHNICIAN", "FRONT_DESK", "MANAGER", "OWNER"]);
  const scope = await staffScope(user);
  const location = scope.current ?? scope.locations[0];
  if (!location || !user.tenantId || !user.salon) {
    return (
      <StaffShell role={user.role} name={user.name}>
        <p>No location is assigned to this login.</p>
      </StaffShell>
    );
  }
  const now = new Date();
  const horizon = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const visits = await scope.db.appointment.findMany({
    where: {
      tenantId: user.tenantId,
      locationId: location.id,
      status: { in: ["BOOKED", "CHECKED_IN", "IN_SERVICE", "READY"] },
      startAt: { lt: horizon },
    },
    include: { client: { include: { favorites: true } }, service: true, technician: true },
    orderBy: { startAt: "asc" },
  });
  const activeVisits = visits.filter((visit) => visit.status !== "READY");
  const readyVisits = visits.filter((visit) => visit.status === "READY");
  const board = buildTurnBoard(
    activeVisits.map((visit) => ({
      id: visit.id,
      status: visit.status,
      start: visit.startAt,
      clientName: visit.client.name,
      technicianName: visit.technician.name,
      serviceName: visit.service.name,
      supplies: visit.service.supplies,
    })),
  );
  const captureVisits = visits.filter((visit) => visit.status === "IN_SERVICE" || visit.status === "CHECKED_IN");

  return (
    <StaffShell role={user.role} name={user.name} salon={`${user.salon.name} · ${location.name}`}>
      <LiveRefresh />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-bark">Tech monitor</p>
          <h1 className="font-serif text-4xl italic text-wine lg:text-6xl">{location.name}</h1>
        </div>
        <form action={setStaffLocation} className="flex items-center gap-2">
          <input type="hidden" name="next" value="/tech" />
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
      <div className="mt-6 flex flex-col gap-6">
        <section className="order-1 rounded-[2rem] bg-white p-5 shadow-card lg:order-2">
          <h2 className="font-serif text-3xl italic">Service photos</h2>
          <p className="mt-1 text-sm text-bark">Use the phone camera. Photos stay with the guest, at every studio.</p>
          <div className="mt-4">
            <PhotoCapture
              appointments={captureVisits.map((visit) => {
                const decision = canCaptureServicePhoto({
                  role: user.role,
                  actorTenantId: user.tenantId,
                  customerTenantId: visit.tenantId,
                  consentAt: visit.client.photoConsentAt,
                  consentRequired: user.salon?.photoConsentRequired ?? true,
                });
                return {
                  id: visit.id,
                  label: `${visit.client.name} · ${visit.service.name}`,
                  blocked: decision.ok ? null : decision.reason,
                };
              })}
            />
          </div>
        </section>
        <section className="order-2 lg:order-1">
          <div className="rounded-[2rem] bg-wine px-6 py-8 text-cream">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">In the chair</p>
            <p className="mt-3 font-serif text-5xl italic leading-none lg:text-7xl">{board.current?.clientName ?? "Open chair"}</p>
            <p className="mt-4 text-lg">{board.current ? `${board.current.serviceName} · ${board.current.technicianName}` : "Waiting for the next guest"}</p>
            {board.current ? (
              <p className="mt-2 text-sm text-gold">
                {favoriteNote(
                  board.current.clientName,
                  visits.find((visit) => visit.id === board.current?.id)?.client.favorites.some((favorite) => favorite.technicianId === visits.find((item) => item.id === board.current?.id)?.technicianId)
                    ? [board.current.technicianName]
                    : [],
                )}
              </p>
            ) : null}
            {board.supplies.length > 0 ? <p className="mt-4 text-sm text-cream/80">Set out: {board.supplies.join(", ")}</p> : null}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <article className="rounded-3xl bg-white p-4 shadow-card">
              <p className="text-xs uppercase tracking-[0.16em] text-bark">Next</p>
              <p className="mt-2 text-2xl">{board.next?.clientName ?? "—"}</p>
              <p className="text-sm text-bark">{board.next ? `${board.next.serviceName} · ${formatWhen(board.next.start, location.timezone)}` : "No one waiting"}</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-card">
              <p className="text-xs uppercase tracking-[0.16em] text-bark">Queue</p>
              <ul className="mt-2 space-y-2 text-sm">
                {board.queue.length === 0 ? <li className="text-bark">The rest of the board is clear.</li> : null}
                {board.queue.map((visit) => (
                  <li key={visit.id}>
                    {visit.clientName} · {visit.serviceName}
                  </li>
                ))}
              </ul>
            </article>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activeVisits.map((visit) => {
              const favorite = visit.client.favorites.some((item) => item.technicianId === visit.technicianId);
              const note = favoriteNote(visit.client.name, favorite ? [visit.technician.name] : []);
              return (
                <form key={visit.id} action={updateVisit} className={`rounded-3xl p-4 ${favorite ? favoriteCardClass(true) : "bg-white shadow-card"}`}>
                  <input type="hidden" name="id" value={visit.id} />
                  <p className="font-medium">{visit.client.name}</p>
                  <p className="text-sm text-bark">{visit.service.name} · {visit.technician.name}</p>
                  {note ? <p className="mt-1 text-sm"><span className="text-gold">★</span> {note}</p> : null}
                  <div className="mt-3 flex gap-2">
                    {visit.status !== "IN_SERVICE" ? <button name="status" value="IN_SERVICE" className={buttonClass("solid")}>Start</button> : null}
                    {visit.status === "IN_SERVICE" ? <button name="status" value="READY" className={buttonClass("solid")}>Finish</button> : null}
                  </div>
                </form>
              );
            })}
          </div>
          {readyVisits.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {readyVisits.map((visit) => (
                <li key={visit.id} className="rounded-2xl bg-white px-4 py-3">{visit.client.name} · finished and ready for checkout</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </StaffShell>
  );
}
