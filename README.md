# Red Lady Spa

Red Lady Spa is the salon app for a multi-location nail studio. Customers book a chair, the front desk checks them in and takes payment, technicians see the turn queue and photograph the service, and the owner edits the menu. Each salon business has its own database. Locations inside that business share the client book.

The live marketing site at redladyspa.com is separate. This package does not change it.

## Run it on Windows

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Node.js 20](https://nodejs.org/), and Git. Open PowerShell in this folder.

```powershell
Copy-Item .env.example .env
docker compose up -d
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm db:setup
pnpm dev
```

If `corepack` is blocked, use `npm install -g pnpm@9.15.0` instead of the two corepack lines.

`pnpm db:setup` waits for Postgres, creates the salon databases, and loads the sample salons. Running it again resets **The Red Lady Spa** and **Lumen Nails** only. Salons you add later in the platform screen stay put.

Open http://localhost:3000.

## Demo logins

These passwords are shown on the sign-in page only while `DEMO_HINTS=true` in `.env`. The production container turns that off.

| Who | Email | Password | Opens |
| --- | --- | --- | --- |
| Customer | ava@redladyspa.com | Demo-Customer-2026 | Home, booking, visit history |
| Technician | chloe@redladyspa.com | Demo-Tech-2026 | Tech screen for both studios |
| Front desk | desk@redladyspa.com | Demo-Desk-2026 | Front desk for both studios |
| Oak Street manager | manager@redladyspa.com | Demo-Manager-2026 | Front desk and owner tools for Oak Street only |
| Owner | owner@redladyspa.com | Demo-Owner-2026 | Every location, plus the rollup |
| Platform admin | platform@redladyspa.com | Demo-Platform-2026 | Salon list. This login is not inside a salon database |
| Lumen owner | maya@lumennails.example | Demo-Lumen-2026 | The second sample salon |

Lumen Nails is a different business. Open it at http://lumen-nails.localhost:3000. A Red Lady login does not see Lumen's book.

## Screens

| Screen | URL |
| --- | --- |
| Customer home | http://localhost:3000 |
| Services | http://localhost:3000/services |
| Shop | http://localhost:3000/shop |
| Book | http://localhost:3000/book |
| Your visits | http://localhost:3000/account |
| Sign in | http://localhost:3000/login |
| Front desk | http://localhost:3000/pos |
| Tech screen | http://localhost:3000/tech |
| Owner portal | http://localhost:3000/admin |
| Platform | http://localhost:3000/platform |

Oak Street can also be opened as http://oak.red-lady-spa.localhost:3000 and Lincoln Park as http://lincoln.red-lady-spa.localhost:3000. Browsers treat `*.localhost` as this computer.

## Add the app to a phone

The customer site and the staff screens are an installable app. The name, icon, and theme color come from the salon you are visiting.

**iPhone:** open the salon in Safari, tap the Share button, then **Add to Home Screen**. The icon uses the salon color.

**Android:** open the salon in Chrome, tap the browser menu, then **Install app** or **Add to Home screen**.

Installed, the app opens full screen without the browser bar. Pages you already opened can show a short offline note. Appointments, payments, and photos still need a connection. The app does not keep copies of the book or of service photos on the phone.

## What the owner can change

Sign in as the owner. The portal edits services, prices, products, technicians, hours, branding, and locations. Customers see those changes on the next page load.

Red Lady starts with two studios:

- **Oak Street** — 18 East Oak Street, Chicago. Monday–Saturday 9–7, Sunday 10–5.
- **Lincoln Park** — 2300 N Lincoln Avenue. Monday–Saturday 10–7, Sunday closed. Gel manicures are $50 there. Midnight Velvet Spark is offered at Oak Street only.

A manager login only sees the studios you assign. The owner sees an **All locations** total for today's tickets. Customers are shared: Ava has one profile and can book either studio. Booking remembers the last studio. If that studio has no open chair, the page lists **Also available at other locations**, nearest first. **Book this again** on a past visit does the same when the original studio is full.

Service photos are taken from the tech screen or can be added at the desk. The camera button is first on a phone. On a TV, the turn list leads. A guest must agree to photos first (the check-in box) while that rule is on. The owner can turn the rule off under branding. Removing a photo hides it and writes an audit row. The file itself is kept for the retention period.

## One business, many locations

Think of the tenant as the company. The Red Lady Spa company has one database. Each studio is a location inside it: its own address, phone, hours, timezone, and optional color, subdomain, or custom domain. Technicians can work at more than one studio. The price list is shared, with a per-studio price, length, or “not offered here.” Stock is counted per studio. The turn queue, the tech TV, and the front desk register follow the studio you pick.

Clients, their history, and their photos belong to the company, so a guest is recognized at every studio.

The platform screen counts active locations. The plan includes a number of locations (1 for the sample) and a price for each extra location ($49 in the sample). That number is a hook for later billing. Stripe is not charged until you add Stripe keys. Until then, set the subscription status on the platform screen.

## Where the data lives

There are two kinds of database:

- **Platform database** (`redlady_platform`). It lists salons, who may sign in as platform admin, the subscription, and which database holds that salon. It does not hold appointments.
- **One database per salon.** Red Lady uses a database named `redladyspa`. Lumen uses `tenant_lumen_nails`. A salon you create later gets `tenant_` plus the slug. The same Postgres server can host all of them. Later, one salon can move to its own server without mixing the rows.

Every salon row also stores its salon id, so a query has to name the salon even inside that salon's own database.

Commands:

```powershell
pnpm tenant:create river-nails "River Nails" owner@river.example "River Owner" "Choose-a-password"
pnpm migrate:all
pnpm tenant:move river-nails "postgresql://USER:PASSWORD@other-host:5432/river_nails"
```

`tenant:move` copies the data, checks the row counts, points the registry at the new database, and leaves the old database in place.

A future phone app (Expo or Capacitor) can call the same JSON APIs. `POST /api/auth/login` with `{ "email", "password" }` returns a token. Send it as `Authorization: Bearer <token>`. The browser uses an httpOnly cookie. Useful routes: `GET /api/tech/board?location=oak-street`, `POST /api/bookings`, `POST /api/push/subscribe`, `GET /api/health`.

`POST /api/push/subscribe` stores a Web Push subscription for appointment reminders. It answers `{ "accepted": true, "mode": "stub" }` until `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set. It does not send a push by itself.

## Photos

Staff upload a before, after, or other photo on a visit. The browser makes a display size and a thumbnail. The server stores the SHA-256 of the original. Locally, files go in `data/photos` (not committed). In AWS, they go to a private S3 bucket encrypted with KMS, with Block Public Access, versioning, and Object Lock in governance mode for 3 years. The app role can read and write objects. It cannot delete them or bypass the lock. A presigned link shows a photo for a few minutes. Set `STORAGE_DRIVER=s3` plus `S3_BUCKET` when the bucket exists. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` work with MinIO.

## Text messages and card billing

Reminders and booking texts log in the terminal and in the salon's message list until you set a real provider.

- Twilio: `SMS_DRIVER=twilio` plus `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM`.
- Amazon SNS: `SMS_DRIVER=sns` plus `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.

`POST /api/jobs/reminders` with `Authorization: Bearer <CRON_SECRET>` sends reminders for visits 20–28 hours out. Call it hourly from a scheduler.

Stripe checkout and the webhook run only when `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` are all set. Otherwise the platform screen stores the status and the webhook answers 501.

## Deploy to AWS

Account `225344348142`, region `us-east-1`. The app is meant for **Amplify Hosting** (Next.js server rendering), not a static export. One Aurora Serverless v2 cluster holds the platform database and every salon's database. It is reachable from the internet because Amplify cannot sit inside a VPC. Storage is encrypted, TLS is required, deletion protection is on, and the password is generated into Secrets Manager.

This stack does **not** change the existing Amplify app `d3axxvf73krhuf`, the database `redladyspadevdb`, or the apex and `www` DNS records for redladyspa.com.

Staging and production can share that one cluster. Each salon still has its own database. Sharing the cluster means a staging experiment can see the same salons as production. If you want a separate staging copy, deploy the stack a second time under another name and point only the staging branch at it. That costs a second Aurora cluster.

**Before you start,** in PowerShell, with the AWS CLI signed into account 225344348142:

```powershell
aws route53 list-resource-record-sets --hosted-zone-id Z05344441WT4S8NDOAE5A --query "ResourceRecordSets[?Name=='redladyspa.com.' || Name=='www.redladyspa.com.']" --output json > route53-before.json
```

Keep that file. Compare it again after any DNS change. Do not edit those records.

If this account already has a GitHub OIDC provider, pass its ARN so CDK does not try to create a second one:

```powershell
cd infra
pnpm install
npx cdk deploy RedLadySaaS --require-approval broadening -c githubOidcProviderArn=arn:aws:iam::225344348142:oidc-provider/token.actions.githubusercontent.com
```

Omit `-c githubOidcProviderArn=...` only when the account has no GitHub OIDC provider yet. CDK prints the database secret ARN, the cluster address, the photo bucket, the Amplify role ARN, and the GitHub role ARN.

Create the Amplify app in the console or with the CLI. Use a **new** app. Do not open `d3axxvf73krhuf`. Connect the GitHub repo `gitinv/X`. Set the monorepo app root to `apps/web`. Amplify reads the root `amplify.yml`.

The build environment needs the real database URLs. `&` and `=` in a URL break PowerShell if you paste them into a comma-separated env list, so write a JSON file and delete it after:

```powershell
$secret = aws secretsmanager get-secret-value --secret-id redlady-saas/database-url --query SecretString --output text
$admin = $secret -replace '/redlady_platform\?', '/postgres?'
@{ environmentVariables = @{
  PLATFORM_DATABASE_URL = $secret
  TENANT_DATABASE_URL = $secret
  TENANT_ADMIN_URL = $admin
  AUTH_SECRET = "replace-with-a-long-random-string"
  DEFAULT_TENANT_SLUG = "red-lady-spa"
  DEMO_HINTS = "false"
  STORAGE_DRIVER = "s3"
  S3_BUCKET = "the-photo-bucket-name-from-cdk"
  S3_REGION = "us-east-1"
  AMPLIFY_MONOREPO_APP_ROOT = "apps/web"
} } | ConvertTo-Json | Set-Content -Encoding utf8 amplify-env.json
aws amplify update-app --app-id YOUR_NEW_APP_ID --cli-input-json file://amplify-env.json
Remove-Item amplify-env.json
```

Attach the CDK Amplify role as the app service role and the SSR compute role. Attach it only to this new app.

Branch `main` is the production app host (`app.redladyspa.com`). Branch `staging` is `staging.redladyspa.com`. Add those hostnames in the Amplify domain UI. Use only the prefixes `app` and `staging`. Leave the apex and `www` alone. Afterward, run the Route 53 command again and diff it with `route53-before.json`.

Put the GitHub role ARN in the repo secret `AWS_ROLE_ARN`, and the **new** Amplify app id in `AMPLIFY_APP_ID`. The deploy workflow then starts an Amplify release on pushes to `main` or `staging`. It does nothing until those secrets exist, and it refuses app id `d3axxvf73krhuf`.

The role can be assumed only by GitHub Actions on `gitinv/X` branches `main` and `staging`.

### Container on Fargate, if you ever leave Amplify

`Dockerfile` runs the same Next.js server (`next start`), migrates the platform database, then migrates every salon. `infra/lib/fargate-alternative.ts` is the shape for a Fargate service: tasks in public subnets with a public IP, database **not** open to the internet, and no NAT gateway. That file is not created by `cdk deploy`. Amplify is the path to use.

## Layout of the code

- `apps/web` — Next.js App Router. Middleware only reads the host and the session cookie. It does not open the database.
- `packages/core` — booking conflicts, turn order, inventory, location access, photo rules, and the offline-cache rule. Vitest.
- `packages/db` — `prisma/platform` (the registry) and `prisma/tenant` (one salon). Two generated clients. A small cache holds at most five salon connections.
- `infra` — AWS CDK stack `RedLadySaaS`.

Sign-in is an email and password hashed with bcrypt. The session is a signed JWT. A later Cognito check can replace the password check without changing the rest of the API.

## Still to wire up

- Real SMS (Twilio or SNS) and a scheduler for `/api/jobs/reminders`.
- Stripe keys, if subscriptions should bill themselves. Per-location pricing is counted and stored, not invoiced.
- VAPID keys, if appointment reminders should arrive as Web Push. Subscriptions are stored either way.
- The Amplify app, domain names, and production `AUTH_SECRET`. You create those in the AWS account. This repo does not deploy them.
- Move a busy salon to its own Aurora cluster with `pnpm tenant:move` when one shared cluster is no longer enough.

## What you need to provide

1. AWS access to account `225344348142` so you can run the CDK command above.
2. A GitHub connection or personal access token so Amplify can read `gitinv/X`.
3. Confirmation that `app.redladyspa.com` and `staging.redladyspa.com` are the hostnames you want, and that apex and `www` stay on the current marketing site.
4. A long random `AUTH_SECRET` for production.
5. Stripe, Twilio or SNS, and VAPID keys only when you want those services to leave demo mode.
