import { CustomerFrame } from "@/components/customer-frame";
import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { formatCents, formatTime } from "@redlady/core";
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
  const names = visit ? (visit.lines.length ? visit.lines.map((line) => line.name).join(", ") : visit.service.name) : "";
  const price = visit ? (visit.lines.length ? visit.lines.reduce((sum, line) => sum + line.priceCents, 0) : visit.service.priceCents) : 0;

  return (
    <CustomerFrame>
      {!visit ? (
        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <h1 className="font-serif text-5xl italic text-wine">We couldn&apos;t find that booking.</h1>
          <p className="mt-4 text-sm text-bark">Check the reference, or book again.</p>
          <Link className="mt-4 inline-block underline" href="/book">
            Back to booking
          </Link>
        </section>
      ) : (
        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <p className="text-xs uppercase tracking-[0.18em] text-bark">Confirmation {visit.reference}</p>
          <h1 className="mt-2 font-serif text-5xl italic text-wine">You&apos;re booked!</h1>
          <p className="mt-4 text-lg">{names}</p>
          <p className="text-bark">
            {visit.location.name} · {visit.technician.name}
          </p>
          <p className="mt-3 text-lg">
            {formatTime(visit.startAt, visit.location.timezone)}–{formatTime(visit.endAt, visit.location.timezone)}
          </p>
          <p className="text-sm text-bark">{formatCents(price)}</p>
          <p className="mt-4 text-sm text-bark">
            We&apos;ll text you a reminder.{" "}
            {signedIn ? (
              <Link className="underline" href="/account">
                Your visits
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
                to see it later.
              </>
            )}
          </p>
        </section>
      )}
    </CustomerFrame>
  );
}
