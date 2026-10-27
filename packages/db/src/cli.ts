import { migrateAll, moveTenant, provisionTenant } from "./provision";
import { platform } from "./clients";

const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === "migrate-all") {
    const results = await migrateAll();
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) process.exitCode = 1;
    return;
  }
  if (command === "create") {
    const [slug, name, ownerEmail, ownerName, ownerPassword] = args;
    if (!slug) throw new Error("Usage: pnpm tenant:create <slug> [name] [owner-email] [owner-name] [password]");
    const tenant = await provisionTenant({
      slug,
      name: name || slug,
      ownerEmail: ownerEmail || `owner@${slug}.example`,
      ownerName: ownerName || "Owner",
      ownerPassword: ownerPassword || "ChangeMe-2026",
    });
    console.log(`Salon ${tenant.slug} is ready on database ${tenant.dbName} at ${tenant.dbHost}.`);
    return;
  }
  if (command === "move") {
    const [slug, nextUrl] = args;
    if (!slug || !nextUrl) throw new Error("Usage: pnpm tenant:move <slug> <postgres-url>");
    const tenant = await moveTenant(slug, nextUrl);
    console.log(`Moved ${tenant.slug} to ${tenant.dbHost}/${tenant.dbName}. The old database was left in place.`);
    return;
  }
  throw new Error("Use create, migrate-all, or move.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await platform.$disconnect();
  });
