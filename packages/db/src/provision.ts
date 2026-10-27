import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import pg from "pg";
import bcrypt from "bcryptjs";
import { evictTenant, getTenantClient, platform, urlForDatabase } from "./clients";
import { clearTenantDatabase } from "./salon";

const exec = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function databaseNameForSlug(slug: string) {
  const safe = slug.toLowerCase().replace(/-/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(safe)) throw new Error("Use a slug like red-lady-spa.");
  return `tenant_${safe}`;
}

export function assertSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug must be lowercase letters, numbers, and hyphens.");
  }
  return slug;
}

function adminUrl() {
  const url = process.env.TENANT_ADMIN_URL || process.env.PLATFORM_DATABASE_URL;
  if (!url) throw new Error("Set PLATFORM_DATABASE_URL in .env.");
  return url;
}

export async function createPhysicalDatabase(dbName: string, connectionString = adminUrl()) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

export async function migratePlatform() {
  await exec("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/platform/schema.prisma"], {
    cwd: packageRoot,
    env: process.env,
    shell: true,
  });
}

export async function migrateTenantUrl(databaseUrl: string) {
  await exec("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/tenant/schema.prisma"], {
    cwd: packageRoot,
    env: { ...process.env, TENANT_DATABASE_URL: databaseUrl },
    shell: true,
  });
}

export async function resolveTenantUrl(tenant: {
  databaseUrl: string | null;
  connectionSecretArn: string | null;
  dbName: string;
}) {
  if (tenant.connectionSecretArn) {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
    const secret = await client.send(new GetSecretValueCommand({ SecretId: tenant.connectionSecretArn }));
    if (!secret.SecretString) throw new Error("The tenant secret is empty.");
    const raw = secret.SecretString.trim();
    if (raw.startsWith("postgres")) return raw;
    const parsed = JSON.parse(raw) as { url?: string; databaseUrl?: string };
    const url = parsed.url || parsed.databaseUrl;
    if (!url) throw new Error("The tenant secret needs a postgres URL.");
    return url;
  }
  if (tenant.databaseUrl) return tenant.databaseUrl;
  return urlForDatabase(adminUrl(), tenant.dbName);
}

export async function migrationVersion(databaseUrl: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const rows = await client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1`,
    );
    return (rows.rows[0]?.migration_name as string | undefined) ?? "not migrated";
  } catch {
    return "not migrated";
  } finally {
    await client.end();
  }
}

export async function migrateAll() {
  await migratePlatform();
  const tenants = await platform.tenant.findMany({ orderBy: { slug: "asc" } });
  const results: { slug: string; ok: boolean; error?: string }[] = [];
  for (const tenant of tenants) {
    try {
      const url = await resolveTenantUrl(tenant);
      await migrateTenantUrl(url);
      results.push({ slug: tenant.slug, ok: true });
      console.log(`migrated ${tenant.slug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "migration failed";
      results.push({ slug: tenant.slug, ok: false, error: message });
      console.error(`FAILED ${tenant.slug}: ${message}`);
    }
  }
  return results;
}

export async function provisionTenant(input: {
  slug: string;
  name: string;
  dbName?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  databaseUrl?: string;
  connectionSecretArn?: string;
}) {
  const slug = assertSlug(input.slug);
  const existing = await platform.tenant.findUnique({ where: { slug } });
  if (existing) return existing;
  const dbName = input.dbName ?? databaseNameForSlug(slug);
  await createPhysicalDatabase(dbName);
  const databaseUrl = input.databaseUrl ?? urlForDatabase(adminUrl(), dbName);
  const host = new URL(databaseUrl).hostname;
  const tenant = await platform.tenant.create({
    data: {
      slug,
      name: input.name,
      status: "PROVISIONING",
      dbName,
      dbHost: host,
      databaseUrl: input.connectionSecretArn ? null : databaseUrl,
      connectionSecretArn: input.connectionSecretArn,
    },
  });
  await migrateTenantUrl(databaseUrl);
  const db = getTenantClient(tenant.id, databaseUrl);
  await db.salonProfile.create({
    data: {
      tenantId: tenant.id,
      name: input.name,
      tagline: input.name,
      about: "",
      phone: "",
      email: input.ownerEmail,
      address: "",
      photoConsentRequired: true,
    },
  });
  const location = await db.location.create({
    data: {
      tenantId: tenant.id,
      slug: "main",
      name: input.name,
      address: "",
      phone: "",
      timezone: "America/Chicago",
    },
  });
  await db.businessHour.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      tenantId: tenant.id,
      locationId: location.id,
      dayOfWeek: day,
      closed: day === 0,
      openMin: 9 * 60,
      closeMin: 19 * 60,
    })),
  });
  await db.register.create({
    data: { tenantId: tenant.id, locationId: location.id, name: "Front desk" },
  });
  await db.user.create({
    data: {
      email: input.ownerEmail.toLowerCase(),
      name: input.ownerName,
      passwordHash: await bcrypt.hash(input.ownerPassword, 8),
      role: "OWNER",
      tenantId: tenant.id,
    },
  });
  return platform.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
}

async function tableCount(databaseUrl: string, table: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const rows = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    return Number(rows.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

export async function moveTenant(slug: string, nextUrl: string) {
  const tenant = await platform.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`No salon named ${slug}.`);
  const source = await resolveTenantUrl(tenant);
  const dir = await mkdtemp(path.join(tmpdir(), "redlady-move-"));
  const dump = path.join(dir, "tenant.dump");
  try {
    await exec("pg_dump", ["--format=custom", "--no-owner", "--file", dump, source]);
    const targetName = new URL(nextUrl).pathname.replace(/^\//, "") || tenant.dbName;
    const admin = new URL(nextUrl);
    admin.pathname = "/postgres";
    admin.search = "";
    await createPhysicalDatabase(targetName, admin.toString());
    await exec("pg_restore", ["--no-owner", "--dbname", nextUrl, dump]);
    const tables = ["User", "Client", "Appointment", "ServicePhoto"];
    for (const table of tables) {
      const before = await tableCount(source, table);
      const after = await tableCount(nextUrl, table);
      if (before !== after) {
        throw new Error(`${table} count changed during the move (${before} -> ${after}). The registry was not changed.`);
      }
    }
    const updated = await platform.tenant.update({
      where: { id: tenant.id },
      data: {
        databaseUrl: nextUrl,
        connectionSecretArn: null,
        dbHost: new URL(nextUrl).hostname,
        dbName: new URL(nextUrl).pathname.replace(/^\//, "") || tenant.dbName,
      },
    });
    evictTenant(tenant.id);
    return updated;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function resetDemoRows(databaseUrl: string) {
  const db = getTenantClient("reset", databaseUrl);
  await clearTenantDatabase(db);
}
