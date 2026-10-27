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
  // Keep TLS and connect-timeout settings (Aurora requires TLS and can take ~15s to resume
  // from auto-pause) but drop everything else, such as schema or pool limits.
  const kept = ["sslmode", "connect_timeout"]
    .map((key) => [key, url.searchParams.get(key)] as const)
    .filter((pair): pair is readonly [string, string] => Boolean(pair[1]));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Options for node-postgres. Prisma treats sslmode=require as "encrypt, do not verify the CA".
 * node-postgres treats it as full verification, which fails against the Amazon RDS CA that Node
 * does not ship. Match Prisma: encrypt the connection without checking the certificate chain.
 */
export function pgClientConfig(connectionString: string) {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  if (!sslmode || sslmode === "disable") return { connectionString };
  url.searchParams.delete("sslmode");
  url.searchParams.delete("schema");
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
}
