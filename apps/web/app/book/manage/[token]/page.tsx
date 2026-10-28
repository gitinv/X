import { CustomerFrame } from "@/components/customer-frame";
import { GuestCancelForm } from "@/components/guest-cancel";
import { readManageToken } from "@/lib/manage-token";
import { getPublicTenant } from "@/lib/tenant";
import { cancellationPolicyText, canCustomerCancel, formatCents, formatTime, reservedMinutes } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "Manage your visit" };

export default async function ManageVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ cancelled?: string; error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const claims = await readManageToken(token);
  const salon = await getPublicTenant();
  const visit =
    claims && salon && salon.id === claims.tenantId
      ? await salon.db.appointment.findFirst({
          where: { id: claims.appointmentId, tenantId: salon.id },
          include: { lines: { orderBy: { sortOrder: "asc" } }, service: true, technician: true, location: true, salon: true },
        })
      : null;
  const policy = cancellationPolicyText(visit?.salon.cancellationWindowHours ?? 24, visit?.salon.cancellationLatePolicy);
  const names = visit ? (visit.lines.length ? visit.lines.map((line) => line.name).join(", ") : visit.service.name) : "";
  const minutes = visit ? (visit.lines.length ? visit.lines.reduce((sum, line) => sum + reservedMinutes(line), 0) : Math.round((visit.endAt.getTime() - visit.startAt.getTime()) / 60000)) : 0;
  const price = visit ? (visit.lines.length ? visit.lines.reduce((sum, line) => sum + line.priceCents, 0) : visit.service.priceCents) : 0;
  const cancellable = visit ? (visit.status === "BOOKED" || visit.status === "CHECKED_IN") && canCustomerCancel(visit.startAt, new Date(), visit.salon.cancellationWindowHours) : false;
  const messages: Record<string, string> = {
    window: policy,
    closed: "This visit can no longer be cancelled here.",
    confirm: "Confirm the cancellation before it is saved.",
    missing: "This link does not match a visit.",
  };

  return (
    <CustomerFrame>
      {!visit ? (
        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <h1 className="font-serif text-5xl italic text-wine">This link has expired.</h1>
          <p className="mt-4 text-sm text-bark">Ask the studio to look up the visit, or book again.</p>
        </section>
      ) : (
        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <p className="text-xs uppercase tracking-[0.18em] text-bark">Confirmation {visit.reference}</p>
          <h1 className="mt-2 font-serif text-5xl italic text-wine">{query.cancelled ? "This visit is cancelled." : "Manage this visit"}</h1>
          <p className="mt-4 text-lg">{names}</p>
          <p className="text-bark">
            {visit.location.name} · {visit.technician.name}
          </p>
          <p className="mt-3">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: visit.location.timezone }).format(visit.startAt)}
          </p>
          <p>
            {formatTime(visit.startAt, visit.location.timezone)}–{formatTime(visit.endAt, visit.location.timezone)} · {minutes} min
          </p>
          <p>{formatCents(price)}</p>
          <p className="mt-4 text-sm text-bark">{policy}</p>
          {query.error ? <p className="mt-3 text-sm text-wine">{messages[query.error] ?? "That change could not be saved."}</p> : null}
          {cancellable && !query.cancelled ? <GuestCancelForm token={token} policy={policy} /> : null}
          <p className="mt-4 text-sm">
            <Link className="underline" href="/login">
              Sign in
            </Link>{" "}
            or{" "}
            <Link className="underline" href="/signup">
              create an account
            </Link>{" "}
            to see every visit.
          </p>
        </section>
      )}
    </CustomerFrame>
  );
}
