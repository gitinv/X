import { PrismaClient as PlatformClient } from "./generated/platform";
import { PrismaClient as TenantClient } from "./generated/tenant";

const globalForDb = globalThis as unknown as {
  platform?: PlatformClient;
  tenantClients?: Map<string, TenantClient>;
};

export const platform =
  globalForDb.platform ??
  new PlatformClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForDb.platform = platform;

const MAX_TENANT_CLIENTS = 5;
const tenantClients = globalForDb.tenantClients ?? new Map<string, TenantClient>();
if (process.env.NODE_ENV !== "production") globalForDb.tenantClients = tenantClients;

export function withPoolLimit(databaseUrl: string, limit = 1) {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", String(limit));
  url.searchParams.set("pool_timeout", "10");
  return url.toString();
}

export function getTenantClient(tenantId: string, databaseUrl: string) {
  const url = withPoolLimit(databaseUrl, 1);
  const key = `${tenantId}|${url}`;
  const existing = tenantClients.get(key);
  if (existing) {
    tenantClients.delete(key);
    tenantClients.set(key, existing);
    return existing;
  }
  if (tenantClients.size >= MAX_TENANT_CLIENTS) {
    const oldest = tenantClients.keys().next().value;
    if (oldest) {
      const client = tenantClients.get(oldest);
      tenantClients.delete(oldest);
      void client?.$disconnect();
    }
  }
  const client = new TenantClient({ datasources: { db: { url } } });
  tenantClients.set(key, client);
  return client;
}

export function evictTenant(tenantId: string) {
  for (const [key, client] of tenantClients) {
    if (key.startsWith(`${tenantId}|`)) {
      void client.$disconnect();
      tenantClients.delete(key);
    }
  }
}

export function urlForDatabase(baseUrl: string, dbName: string) {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  url.search = "";
  return url.toString();
}
