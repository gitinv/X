import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import type { ReactNode } from "react";
import { CustomerShell } from "./shells";
import { SetupScreen } from "./ui";

export async function CustomerFrame({ children }: { children: ReactNode }) {
  let tenant: Awaited<ReturnType<typeof getPublicTenant>> = null;
  try {
    tenant = await getPublicTenant();
  } catch {
    return <SetupScreen />;
  }
  if (!tenant) return <SetupScreen />;
  const session = await getSession();
  return (
    <CustomerShell name={tenant.name} tagline={tenant.tagline} brandColor={tenant.brandColor} signedInName={session?.name}>
      {children}
    </CustomerShell>
  );
}
