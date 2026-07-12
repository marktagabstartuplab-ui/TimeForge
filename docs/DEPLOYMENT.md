# TimeForge Deployment Guide

Recommended architecture: **Railway** (API + Worker + Redis) + **Vercel** (frontend) + **Supabase** (Postgres, already provisioned — project `rfwqxeboudsjykhghbjk`). Render or Fly.io work as drop-in substitutes for Railway; the steps are the same except for their platform-specific dashboards.

Vercel cannot run the API or worker — they're persistent Node processes (a long-running NestJS server and an always-on BullMQ consumer), not serverless functions. Only the Next.js frontend goes on Vercel.

---

## 1. Backend (API) deployment — Railway

The repo includes `railway.json` and `docker/Dockerfile` — Railway auto-detects both.

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → select this repo.
2. Railway reads `railway.json` automatically: builds via `docker/Dockerfile`, runs `npx prisma migrate deploy && node dist/apps/api/src/main.js`, health-checks `/api/v1/health`.
3. Add a **Redis** plugin from Railway's service catalog (one click) — copy its connection string into `REDIS_URL`.
4. Set environment variables (Railway → Variables tab) — see [§4](#4-environment-variables) for the full list. At minimum for the API to boot: `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, `NODE_ENV=production`, `OPENAI_API_KEY`.
5. Deploy. Railway assigns a public URL (e.g. `https://timeforge-api.up.railway.app`) — this is what becomes `NEXT_PUBLIC_API_URL` for the frontend.
6. Confirm `GET https://<your-api-domain>/api/v1/health` returns `{"status":"ok","db":"up"}`.

## 2. Worker deployment — Railway (second service, same repo)

BullMQ workers need their own always-on process — don't try to run this inside the API service.

1. In the same Railway project: **New Service** → **Deploy from GitHub repo** → same repo again.
2. This second service will also pick up `railway.json` by default — override its settings in **Settings → Deploy**:
   - **Start Command**: `node dist/apps/worker/src/main.js` (overrides `railway.json`'s API-specific start command)
   - **Healthcheck Path**: leave empty / disable — the worker has no HTTP surface to probe.
3. Environment variables: same as the API service (`DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `SMTP_*`, `STORAGE_DRIVER`/`SUPABASE_*` if using Supabase storage). JWT secrets aren't required by the worker itself but are harmless to include.
4. Deploy. Confirm via **Logs**: look for `"TimeForge worker started — listening for BullMQ jobs."` and, after a few minutes, the day-rollover sweep's periodic log line — both confirm all queues registered without errors.

## 3. Frontend deployment — Vercel

`apps/web` is a fully standalone Next.js package (own lockfile, no monorepo build dependency) — this is a plain import, no special monorepo config needed.

1. Vercel dashboard → **Add New Project** → import this GitHub repo.
2. **Root Directory**: `apps/web`. Framework preset (Next.js) auto-detects.
3. Environment variables (Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL` → the Railway API's public URL from step 1.6 (no trailing slash)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → only needed for real-time notifications; the app degrades gracefully without them.
4. Deploy. Vercel assigns a domain (e.g. `https://timeforge.vercel.app`).
5. **Go back to the Railway API service** and set `CORS_ORIGINS` to this exact Vercel domain (comma-separated if you have more than one, e.g. a preview + production domain). This same value is also used to build the links in password-reset and email-verification emails — get it right or those links will point at the wrong host.
6. Redeploy the API service after updating `CORS_ORIGINS` (env var changes require a redeploy to take effect).

## 4. Environment variables

Full reference: [`.env.example`](../.env.example) (backend) and [`apps/web/.env.example`](../apps/web/.env.example) (frontend). Every variable there is required or has a documented safe default — nothing is missing from that file.

**Do not reuse dev defaults in production** — `env.validation.ts` will refuse to boot if `NODE_ENV=production` and any of these are still placeholder values:
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate real ones: `openssl rand -hex 64`
- `COOKIE_SECURE` must be `true`
- `REDIS_URL` must not be `redis://localhost:6379`

## 5. Database migrations

The Supabase Postgres project is already provisioned — production uses the same database, just pointed at from the deployed API instead of a local dev machine.

- `DATABASE_URL` → Supabase **pooled** connection (Supavisor, port 6543, append `&pgbouncer=true`)
- `DIRECT_URL` → Supabase **direct** connection (port 5432) — used for migrations only
- Railway's `railway.json` already runs `npx prisma migrate deploy` before every API boot — migrations apply automatically on each deploy. No manual step needed under normal operation.
- To apply migrations manually (e.g. before the first deploy, or to check status without deploying): `npx prisma migrate deploy` from a machine with `DIRECT_URL` set to the production database.
- **Do not** run `npm run db:seed` against production — it's for demo/dev data only. If you need an initial admin account in a fresh production database, create it directly or write a one-off script — don't repurpose the demo seed script, since it creates the full set of demo accounts with the shared `ChangeMe123!` password.
- Row-Level Security: `npm run db:rls` applies the RLS policies documented in `prisma/sql/rls.sql`. This is a deliberate, separate cutover (switching `DATABASE_URL`'s role from `timeforge_owner` to the restricted `timeforge_app` role) — not part of routine deploys. See `docs/RLS-ENABLEMENT-REPORT.md` before doing this in production.

## 6. Redis setup

BullMQ requires Redis ≥ 5.0 (the codebase's own local dev Redis has run on 5.0.14.1 throughout this engagement; production should use ≥ 6.2 per Redis's own recommendation, though 5.x is functionally sufficient).

- **Railway**: add the Redis plugin from their service catalog — copy its `REDIS_URL` into both the API and worker service's environment variables (same value, both services must point at the same Redis instance).
- **Managed alternatives** (Upstash, Redis Cloud): if the provider requires TLS, use a `rediss://` URL — both the API and worker already detect `rediss://` and enable TLS automatically (fixed this session; see [Files Modified](#files-modified) below).
- Both the API and worker must connect to the **same** Redis instance — they share BullMQ queues (the worker consumes what the API enqueues, and vice versa for status jobs).

## 7. Post-deployment verification

Run through this after every deploy, not just the first one:

1. `GET https://<api-domain>/api/v1/health` → `{"status":"ok","db":"up"}`
2. `GET https://<api-domain>/api/docs` → Swagger UI loads
3. Log into the frontend with a real (non-demo) account, confirm no blank screen, correct dashboard per role
4. Trigger one AI job (e.g. Finance → Generate AI Report) and confirm it completes and a notification arrives
5. Check the worker service's logs for `SUCCEEDED` job entries and no unexpected `FAILED` ones
6. Confirm CORS: open the browser console on the deployed frontend, make sure no CORS errors appear on API calls
7. Confirm cookies: log in, refresh the page, confirm the session persists (validates `COOKIE_SECURE`/domain config is correct for HTTPS)

## 8. Rollback procedure

- **Frontend (Vercel)**: Vercel keeps every deployment. Dashboard → Deployments → find the last known-good deployment → **Promote to Production**. Instant, no rebuild needed.
- **Backend (Railway)**: Dashboard → Deployments → select a previous successful deployment → **Redeploy**. Railway keeps build artifacts for prior deploys.
- **Database migrations**: `prisma migrate deploy` only ever adds forward migrations — there's no automatic down-migration. If a migration needs reverting, write and apply a new forward migration that undoes the change (standard Prisma practice); do not attempt to manually roll back the migrations table.
- **Worker**: same as API — redeploy the previous build via Railway's dashboard. Because BullMQ jobs are idempotent-by-`Idempotency-Key` where required, a brief worker outage during rollback does not lose or duplicate work — queued jobs simply wait until the worker is back.

---

## Files Modified (this deployment-prep pass)

- `apps/api/tsconfig.app.json`, `apps/worker/tsconfig.app.json` — fixed `outDir` so compiled output lands at `dist/apps/{api,worker}/src/main.js` instead of a duplicated `dist/apps/api/apps/api/src/main.js` path (a genuine, previously-undetected bug — CI never caught it because CI only runs `npm run build`, never executes the built output)
- `docker/Dockerfile`, `docker-compose.yml`, `package.json` — updated to the corrected build-output path
- `apps/api/src/config/configuration.ts` — now prefers platform-injected `PORT` over `API_PORT`, matching Railway/Render/Fly.io convention
- `apps/api/src/app.module.ts`, `apps/worker/src/worker.module.ts` — BullMQ Redis connections now enable TLS automatically for `rediss://` URLs (required by some managed Redis providers)
- `.dockerignore` (new) — keeps `.env`, `node_modules`, `.git` out of the Docker build context
- `railway.json` (new) — Railway build/deploy config for the API service
- `.env.example`, `apps/web/.env.example` — documented `PORT` behavior, `CORS_ORIGINS`'s dual purpose, and the previously-undocumented `NEXT_PUBLIC_SUPABASE_*` frontend variables
