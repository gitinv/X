import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");

if (existsSync(envFile)) {
  config({ path: envFile });
}

if (!process.env.PLATFORM_DATABASE_URL) {
  console.error("PLATFORM_DATABASE_URL is not set. Copy .env.example to .env, then try again.");
  process.exit(1);
}
if (!process.env.TENANT_DATABASE_URL) {
  process.env.TENANT_DATABASE_URL = process.env.PLATFORM_DATABASE_URL;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("No command was given to with-env.");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: root,
});

child.on("exit", (code) => process.exit(code ?? 1));
