import { cancelVisit } from "@/app/account/actions";
import { CustomerFrame } from "@/components/customer-frame";
import { Notice, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createDownloadUrl } from "@/lib/photos/storage";
import { canViewServicePhoto, formatWhen } from "@redlady/core";
import Link from "next/link";

export const metadata = { title: "Your visits" };

const messages: Record<string, string> = {
  window: "This visit is inside the cancellation window. Call the salon and the front desk can change it.",
  forbidden: "That visit is not on your profile.",
  closed: "That visit can no longer be cancelled here.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const visits =
    user.clientId && user.db && user.tenantId
      ? await user.db.appointment.findMany({
          where: { tenantId: user.tenantId, clientId: user.clientId },
          include: { service: true, technician: true, location: true, photos: true },
          orderBy: { startAt: "desc" },
        })
      : [];
  const windowHours = user.salon?.cancellationWindowHours ?? 2;
  const cards = await Promise.all(
    visits.map(async (visit) => {
      const visible = visit.photos.filter((photo) =>
        canViewServicePhoto(
          { role: "CUSTOMER", tenantId: user.tenantId, clientId: user.clientId },
          { tenantId: photo.tenantId, clientId: photo.clientId, deletedAt: photo.deletedAt },
        ),
      );
      const thumbs = await Promise.all(visible.map(async (photo) => ({ id: photo.id, label: photo.label, src: await createDownloadUrl(photo.thumbKey) })));
      return { visit, thumbs };
    }),
  );

  return (
    <CustomerFrame>
      <h1 className="font-serif text-5xl italic text-wine">Your visits</h1>
      <p className="mt-2 text-sm text-bark">{user.name}</p>
      <p className="mt-3 max-w-xl text-sm text-bark">
        Add Red Lady to your home screen to book with one tap. On iPhone, open Share and choose Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home screen.
      </p>
      {params.saved ? (
        <div className="mt-4">
          <Notice>The visit was cancelled.</Notice>
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-4">
          <Notice tone="warn">{messages[params.error] ?? "That change could not be saved."}</Notice>
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
            const cancellable = (visit.status === "BOOKED" || visit.status === "CHECKED_IN") && visit.startAt.getTime() - Date.now() >= windowHours * 60 * 60 * 1000;
            return (
              <li key={visit.id} className="rounded-3xl bg-white p-4 shadow-card">
                <p className="font-medium">{visit.service.name}</p>
                <p className="text-sm text-bark">
                  {formatWhen(visit.startAt, visit.location.timezone)} · {visit.technician.name} · {visit.location.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-bark">{visit.status.replaceAll("_", " ")}</p>
                {thumbs.length > 0 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {thumbs.map((photo) => (
                      <img key={photo.id} src={photo.src} alt={photo.label.toLowerCase()} className="h-24 w-24 rounded-2xl object-cover" />
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {visit.status === "COMPLETED" ? (
                    <Link className={buttonClass("solid")} href={`/book?service=${visit.serviceId}&tech=${visit.technicianId}&location=${visit.location.slug}`}>
                      Book this again
                    </Link>
                  ) : null}
                  {cancellable ? (
                    <form action={cancelVisit}>
                      <input type="hidden" name="id" value={visit.id} />
                      <button className={buttonClass("ghost")}>Cancel visit</button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CustomerFrame>
  );
}
