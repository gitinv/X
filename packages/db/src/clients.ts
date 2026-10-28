import { PrismaClient as PlatformClient } from "./generated/platform";
import { PrismaClient as TenantClient } from "./generated/tenant";

const globalForDb = globalThis as unknown as {
  platform?: PlatformClient;
  tenantClients?: Map<string, TenantClient>;
};

export const DATABASE_CONNECT_TIMEOUT_SECONDS = 30;
export const DATABASE_POOL_TIMEOUT_SECONDS = 30;

const COLD_START_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);

export class DatabaseWakingError extends Error {
  readonly digest = "DATABASE_WAKING";

  constructor() {
    super("Waking up, one moment");
    this.name = "DatabaseWakingError";
  }
}

export function withPoolLimit(databaseUrl: string, limit = 1) {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", String(limit));
  url.searchParams.set("pool_timeout", String(DATABASE_POOL_TIMEOUT_SECONDS));
  const existing = Number(url.searchParams.get("connect_timeout") || "0");
  url.searchParams.set("connect_timeout", String(Math.max(existing, DATABASE_CONNECT_TIMEOUT_SECONDS)));
  return url.toString();
}

function platformClient() {
  const raw = process.env.PLATFORM_DATABASE_URL;
  return new PlatformClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(raw ? { datasources: { db: { url: withPoolLimit(raw, 2) } } } : {}),
  });
}

export const platform = globalForDb.platform ?? platformClient();

if (process.env.NODE_ENV !== "production") globalForDb.platform = platform;

const MAX_TENANT_CLIENTS = 5;
const tenantClients = globalForDb.tenantClients ?? new Map<string, TenantClient>();
if (process.env.NODE_ENV !== "production") globalForDb.tenantClients = tenantClients;

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
export function isDatabaseWaking(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if (error instanceof DatabaseWakingError) return true;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (COLD_START_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : "";
  return /starting up|not yet accepting connections|ECONNREFUSED|ETIMEDOUT|Can't reach database server|Timed out fetching a new connection|Connection terminated|57P03|the database system is/i.test(message);
}

export async function resetConnections() {
  await Promise.all([...tenantClients.values()].map((client) => client.$disconnect().catch(() => undefined)));
  tenantClients.clear();
  await platform.$disconnect().catch(() => undefined);
}

export async function withDatabaseRetry<T>(
  run: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void>; beforeRetry?: () => Promise<void> },
) {
  const attempts = options?.attempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!isDatabaseWaking(error) || attempt === attempts - 1) break;
      await options?.beforeRetry?.();
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  if (isDatabaseWaking(last)) throw new DatabaseWakingError();
  throw last;
}

export function pgClientConfig(connectionString: string) {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const timeout = DATABASE_CONNECT_TIMEOUT_SECONDS * 1000;
  if (!sslmode || sslmode === "disable") return { connectionString, connectionTimeoutMillis: timeout };
  url.searchParams.delete("sslmode");
  url.searchParams.delete("schema");
  return { connectionString: url.toString(), connectionTimeoutMillis: timeout, ssl: { rejectUnauthorized: false } };
}
