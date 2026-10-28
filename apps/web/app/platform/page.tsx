import { createSalon, setSubscription } from "@/app/platform/actions";
import { StaffShell } from "@/components/shells";
import { Notice, buttonClass } from "@/components/ui";
import { requireRoles } from "@/lib/auth/session";
import { locationCharge } from "@redlady/core";
import { getTenantClient, migrationVersion, platform, resolveTenantUrl } from "@redlady/db";
import { currentBillingMode } from "@/lib/billing";

export const metadata = { title: "Platform" };

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const user = await requireRoles(["PLATFORM_ADMIN"]);
  const tenants = await platform.tenant.findMany({ orderBy: { name: "asc" }, include: { domains: true } });
  const rows = await Promise.all(
    tenants.map(async (tenant) => {
      let locationCount = 0;
      let version = "not migrated";
      try {
        const url = await resolveTenantUrl(tenant);
        version = await migrationVersion(url);
        const db = getTenantClient(tenant.id, url);
        locationCount = await db.location.count({ where: { tenantId: tenant.id, active: true } });
      } catch {
        locationCount = 0;
      }
      return { tenant, locationCount, version, charge: locationCharge({ activeLocations: locationCount, includedLocations: tenant.includedLocations, extraLocationPriceCents: tenant.extraLocationPriceCents }) };
    }),
  );

  return (
    <StaffShell role={user.role} name={user.name} salon="Every salon">
      <p className="text-xs uppercase tracking-[0.18em] text-bark">Platform</p>
      <h1 className="font-serif text-5xl italic text-wine">Salons</h1>
      <p className="mt-2 text-sm text-bark">Billing mode: {currentBillingMode() === "stripe" ? "Stripe" : "saved in this app until Stripe keys are added"}.</p>
      {params.saved ? <div className="mt-4"><Notice>Saved.</Notice></div> : null}
      {params.error ? <div className="mt-4"><Notice tone="warn">{params.error}</Notice></div> : null}
      <ul className="mt-6 space-y-4">
        {rows.map(({ tenant, locationCount, version, charge }) => (
          <li key={tenant.id} className="rounded-3xl bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{tenant.name}</p>
              <p className="text-sm text-bark">{tenant.subscriptionStatus}</p>
            </div>
            <p className="mt-1 text-sm text-bark">
              {tenant.slug} · {tenant.dbHost}/{tenant.dbName} · migration {version}
            </p>
            <p className="text-sm text-bark">
              {locationCount} active location{locationCount === 1 ? "" : "s"} · plan includes {tenant.includedLocations} · extra {charge.extraLocations} · hook {charge.monthlyCents / 100} dollars, not charged
            </p>
            {tenant.domains.length > 0 ? <p className="text-sm text-bark">{tenant.domains.map((domain) => domain.hostname).join(", ")}</p> : null}
            <form action={setSubscription} className="mt-3 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="id" value={tenant.id} />
              <select name="status" defaultValue={tenant.subscriptionStatus}>
                <option value="TRIAL">Trial</option>
                <option value="ACTIVE">Active</option>
                <option value="PAST_DUE">Past due</option>
                <option value="CANCELED">Canceled</option>
              </select>
              <input name="includedLocations" type="number" min={1} defaultValue={tenant.includedLocations} aria-label="Included locations" />
              <input name="extraLocationPrice" type="number" min={0} step="0.01" defaultValue={(tenant.extraLocationPriceCents / 100).toFixed(2)} aria-label="Price per extra location" />
              <button className={buttonClass("solid")}>Save plan</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={createSalon} className="mt-8 grid gap-3 rounded-3xl bg-white p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-serif text-3xl italic sm:col-span-2">Open a salon database</h2>
        <label className="text-sm">Slug<input name="slug" placeholder="river-nails" required /></label>
        <label className="text-sm">Name<input name="name" required /></label>
        <label className="text-sm">Owner email<input name="ownerEmail" type="email" required /></label>
        <label className="text-sm">Owner name<input name="ownerName" /></label>
        <label className="text-sm">Temporary password<input name="ownerPassword" required minLength={8} /></label>
        <label className="text-sm">Included locations<input name="includedLocations" type="number" min={1} defaultValue={1} /></label>
        <label className="text-sm">Extra location price (dollars)<input name="extraLocationPrice" type="number" min={0} step="0.01" defaultValue={49} /></label>
        <button className={buttonClass("solid")}>Create salon</button>
      </form>
    </StaffShell>
  );
}
