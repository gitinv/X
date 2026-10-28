#!/usr/bin/env bash
# Amplify build step. Writes the variables the build and the server need into
# .env (root, read by scripts/with-env.mjs and next.config.mjs) and
# apps/web/.env.production (read by the Next.js server at runtime on Amplify).
# Both files are git-ignored and only exist inside the Amplify build container.
# Values come from the Amplify app's environment variables. The database URL can
# instead come from Secrets Manager through DATABASE_URL_SECRET_ID, so the
# password never sits in the Amplify console.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ -z "${PLATFORM_DATABASE_URL:-}" ] && [ -n "${DATABASE_URL_SECRET_ID:-}" ]; then
  PLATFORM_DATABASE_URL="$(aws secretsmanager get-secret-value --region "${S3_REGION:-us-east-1}" \
    --secret-id "$DATABASE_URL_SECRET_ID" --query SecretString --output text)"
fi
if [ -z "${PLATFORM_DATABASE_URL:-}" ]; then
  echo "Set PLATFORM_DATABASE_URL or DATABASE_URL_SECRET_ID on the Amplify app." >&2
  exit 1
fi
# Aurora Serverless pauses when idle. Resume can take longer than Prisma's
# default 10s pool wait, which is what turned the first page into a 500.
for param in connect_timeout pool_timeout; do
  case "$PLATFORM_DATABASE_URL" in
    *"${param}="*) ;;
    *\?*) PLATFORM_DATABASE_URL="${PLATFORM_DATABASE_URL}&${param}=30" ;;
    *) PLATFORM_DATABASE_URL="${PLATFORM_DATABASE_URL}?${param}=30" ;;
  esac
done
export PLATFORM_DATABASE_URL
export TENANT_DATABASE_URL="${TENANT_DATABASE_URL:-$PLATFORM_DATABASE_URL}"
export TENANT_ADMIN_URL="${TENANT_ADMIN_URL:-$(printf '%s' "$PLATFORM_DATABASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')}"

names="PLATFORM_DATABASE_URL TENANT_DATABASE_URL TENANT_ADMIN_URL AUTH_SECRET DEFAULT_TENANT_SLUG DEMO_HINTS
STORAGE_DRIVER S3_BUCKET S3_REGION PHOTO_KMS_KEY_ID SMS_DRIVER CRON_SECRET APP_ORIGIN
STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM
VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY"

: > .env
for name in $names; do
  value="${!name:-}"
  if [ -n "$value" ]; then
    printf '%s="%s"\n' "$name" "$value" >> .env
  fi
done
cp .env apps/web/.env.production
echo "Wrote $(wc -l < .env | tr -d ' ') settings for the build and the server."
