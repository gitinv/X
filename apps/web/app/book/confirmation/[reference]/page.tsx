import { CustomerFrame } from "@/components/customer-frame";
import { signManageToken } from "@/lib/manage-token";
import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { formatCents, formatTime, reservedMinutes } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "You're booked" };

export default async function ConfirmationPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const salon = await getPublicTenant();
  const session = await getSession();
  const visit = salon
    ? await salon.db.appointment.findFirst({
        where: { tenantId: salon.id, reference },
        include: { lines: { orderBy: { sortOrder: "asc" } }, technician: true, location: true, service: true },
      })
    : null;
  const signedIn = Boolean(session?.clientId);
  const names = visit ? (visit.lines.length ? visit.lines.map((line) => line.name) : [visit.service.name]) : [];
  const price = visit ? (visit.lines.length ? visit.lines.reduce((sum, line) => sum + line.priceCents, 0) : visit.service.priceCents) : 0;
  const minutes = visit ? (visit.lines.length ? visit.lines.reduce((sum, line) => sum + reservedMinutes(line), 0) : Math.round((visit.endAt.getTime() - visit.startAt.getTime()) / 60000)) : 0;
  let manageHref = "";
  if (visit && salon) {
    try {
      manageHref = `/book/manage/${await signManageToken({ appointmentId: visit.id, tenantId: salon.id })}`;
    } catch {
      manageHref = "";
    }
  }
  const when = visit
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: visit.location.timezone }).format(visit.startAt)
    : "";

  return (
    <CustomerFrame>
      {!visit ? (
        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <h1 className="font-serif text-5xl italic text-wine">We couldn&apos;t find that booking.</h1>
          <p className="mt-4 text-sm text-bark">Check the confirmation number, or book again.</p>
          <Link className="mt-4 inline-block underline" href="/book">
            Back to booking
          </Link>
        </section>
      ) : (
        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <p className="text-xs uppercase tracking-[0.18em] text-bark">Confirmation number</p>
          <h1 className="mt-2 font-serif text-5xl italic text-wine">{visit.reference}</h1>
          <p className="mt-4 text-lg">You&apos;re booked. We&apos;ll text you a reminder.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-bark">Date</dt>
              <dd>{when}</dd>
            </div>
            <div>
              <dt className="text-bark">Time</dt>
              <dd>
                {formatTime(visit.startAt, visit.location.timezone)}–{formatTime(visit.endAt, visit.location.timezone)} · {minutes} min
              </dd>
            </div>
            <div>
              <dt className="text-bark">Studio</dt>
              <dd>
                {visit.location.name} · {visit.technician.name}
              </dd>
            </div>
            <div>
              <dt className="text-bark">Services</dt>
              <dd>{names.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-bark">Total</dt>
              <dd>{formatCents(price)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-bark">
            {signedIn ? (
              <Link className="underline" href="/account">
                My visits
              </Link>
            ) : (
              <>
                <Link className="underline" href="/login">
                  Sign in
                </Link>{" "}
                or{" "}
                <Link className="underline" href="/signup">
                  create an account
                </Link>{" "}
                to see this later.
              </>
            )}
            {manageHref ? (
              <>
                {" "}
                <Link className="underline" href={manageHref}>
                  Change or cancel this visit
                </Link>
                .
              </>
            ) : null}
          </p>
        </section>
      )}
    </CustomerFrame>
  );
}
