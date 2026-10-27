#!/bin/sh
set -eu
cd /app
node scripts/with-env.mjs pnpm --filter @redlady/db exec prisma migrate deploy --schema prisma/platform/schema.prisma
node scripts/with-env.mjs pnpm --filter @redlady/db exec tsx src/cli.ts migrate-all
cd /app/apps/web
exec pnpm start
