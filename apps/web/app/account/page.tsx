import { CustomerFrame } from "@/components/customer-frame";
import { InstallHint } from "@/components/install-hint";
import { FavoriteToggle } from "@/components/favorite-mark";
import { PhotoThumb } from "@/components/photo-thumb";
import { Notice, buttonClass } from "@/components/ui";
import { CancelVisitForm, RescheduleVisitForm } from "@/components/visit-actions";
import { requireUser } from "@/lib/auth/session";
import { createDownloadUrl } from "@/lib/photos/storage";
import { canViewServicePhoto, cancellationPolicyText, formatTime, formatWhen, reservedMinutes, sortCustomerVisits } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "Your visits" };

const messages: Record<string, string> = {
  window: "This visit is inside the cancellation window. Call the salon and the front desk can change it.",
  forbidden: "That visit is not on your profile.",
  closed: "That visit can no longer be changed here.",
  confirm: "Please confirm the change before it is saved.",
  time: "Please choose a future time.",
};

function bookAgainHref(visit: { serviceId: string; technicianId: string; lines: { serviceId: string }[]; location: { slug: string } }) {
  const services = (visit.lines.length ? visit.lines.map((line) => line.serviceId) : [visit.serviceId]).join(",");
  return `/book?services=${services}&tech=${visit.technicianId}&location=${visit.location.slug}`;
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const visits =
    user.clientId && user.db && user.tenantId
      ? sortCustomerVisits(
          await user.db.appointment.findMany({
            where: { tenantId: user.tenantId, clientId: user.clientId },
            include: { service: true, technician: true, location: true, photos: true, lines: { orderBy: { sortOrder: "asc" } }, client: { include: { favorites: true } } },
          }),
          new Date(),
        )
      : [];
  const windowHours = user.salon?.cancellationWindowHours ?? 24;
  const policy = cancellationPolicyText(windowHours, user.salon?.cancellationLatePolicy);
  const cards = await Promise.all(
    visits.map(async (visit) => {
      const visible = visit.photos.filter((photo) =>
        canViewServicePhoto(
          { role: "CUSTOMER", tenantId: user.tenantId, clientId: user.clientId },
          { tenantId: photo.tenantId, clientId: photo.clientId, deletedAt: photo.deletedAt },
        ),
      );
      const thumbs = (
        await Promise.all(visible.map(async (photo) => ({ id: photo.id, label: photo.label, src: await createDownloadUrl(photo.thumbKey) })))
      ).filter((photo) => photo.src);
      return { visit, thumbs };
    }),
  );
  const saved = params.saved === "moved" ? "The visit was moved." : params.saved ? "The visit was cancelled." : "";
  const error = params.error ? (messages[params.error] ?? (params.error.includes(" ") ? params.error : "That change could not be saved.")) : "";

  return (
    <CustomerFrame>
      <h1 className="font-serif text-5xl italic text-wine">Your visits</h1>
      <p className="mt-2 text-sm text-bark">{user.name}</p>
      <InstallHint />
      {saved ? (
        <div className="mt-4">
          <Notice>{saved}</Notice>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      {!user.clientId ? (
        <p className="mt-6 text-sm">
          This login is a staff account.{" "}
          <Link href={user.role === "OWNER" || user.role === "MANAGER" ? "/admin" : user.role === "PLATFORM_ADMIN" ? "/platform" : user.role === "TECHNICIAN" ? "/tech" : "/pos"} className="underline">
            Open your workspace
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {cards.length === 0 ? <li className="text-sm text-bark">No visits yet.</li> : null}
          {cards.map(({ visit, thumbs }) => {
            const open = visit.status === "BOOKED" || visit.status === "CHECKED_IN";
            const cancellable = open && visit.startAt.getTime() - Date.now() >= windowHours * 60 * 60 * 1000;
            const again = bookAgainHref(visit);
            return (
              <li key={visit.id} className="rounded-3xl bg-white p-4 shadow-card">
                <p className="font-medium">{visit.lines.length ? visit.lines.map((line) => line.name).join(", ") : visit.service.name}</p>
                <p className="text-sm text-bark">{formatTime(visit.startAt, visit.location.timezone)}–{formatTime(visit.endAt, visit.location.timezone)} · {visit.lines.length ? visit.lines.reduce((sum, line) => sum + reservedMinutes(line), 0) : Math.round((visit.endAt.getTime() - visit.startAt.getTime()) / 60000)} min</p>
                <p className="flex items-center gap-1 text-sm text-bark">
                  {formatWhen(visit.startAt, visit.location.timezone)} · {visit.technician.name}
                  <FavoriteToggle technicianId={visit.technicianId} name={visit.technician.name} active={visit.client.favorites.some((favorite) => favorite.technicianId === visit.technicianId)} />
                  · {visit.location.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-bark">{visit.status.replaceAll("_", " ")}</p>
                {thumbs.length > 0 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {thumbs.map((photo) => (
                      <PhotoThumb key={photo.id} src={photo.src} alt={photo.label.toLowerCase()} quiet className="h-24 w-24 rounded-2xl object-cover" />
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {visit.status === "COMPLETED" ? (
                    <Link className={buttonClass("solid")} href={again}>
                      Book this again
                    </Link>
                  ) : null}
                  {visit.status === "CANCELLED" ? (
                    <Link className={buttonClass("solid")} href={again}>
                      Rebook
                    </Link>
                  ) : null}
                  {visit.status === "BOOKED" ? <RescheduleVisitForm id={visit.id} timezone={visit.location.timezone} /> : null}
                  {cancellable ? <CancelVisitForm id={visit.id} policy={policy} /> : null}
                </div>
                {open && !cancellable ? <p className="mt-2 text-sm text-bark">{policy}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </CustomerFrame>
  );
}
