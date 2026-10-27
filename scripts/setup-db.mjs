import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");

if (!existsSync(envFile)) {
  console.error("Missing .env. In PowerShell run: Copy-Item .env.example .env");
  process.exit(1);
}

config({ path: envFile });

const databaseUrl = process.env.PLATFORM_DATABASE_URL;
if (!databaseUrl) {
  console.error("PLATFORM_DATABASE_URL is empty in .env.");
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const host = parsed.hostname;
const port = Number(parsed.port || 5432);

function waitForPort() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = net.connect({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > 60_000) {
          reject(new Error(`Postgres did not open ${host}:${port} within 60 seconds. Is Docker running?`));
          return;
        }
        setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: true, env: process.env, cwd: root });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

await waitForPort();
console.log("Postgres is accepting connections.");
await run("pnpm", ["db:generate"]);
await run("pnpm", ["db:deploy"]);
await run("pnpm", ["db:seed"]);
console.log("Database is migrated and the Red Lady Spa demo data is loaded.");
