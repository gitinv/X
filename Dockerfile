FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY infra/package.json infra/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV PLATFORM_DATABASE_URL=postgresql://build:build@localhost:5432/platform
ENV TENANT_DATABASE_URL=postgresql://build:build@localhost:5432/tenant
ENV AUTH_SECRET=build-only-not-a-runtime-secret
ENV DEMO_HINTS=false
RUN pnpm db:generate && pnpm --filter web build
RUN chmod +x /app/docker/entrypoint.sh
EXPOSE 3000
CMD ["/app/docker/entrypoint.sh"]
