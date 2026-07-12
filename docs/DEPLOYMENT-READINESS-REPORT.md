# Deployment Readiness Report

**Date:** 2026-07-12
**Scope:** Prepare the existing, fully-verified TimeForge codebase for its first staging/production deployment. No architecture changes, no new features, no business-logic edits — every change below is either a deployment-configuration addition or a fix for a genuine bug that would have broken deployment specifically.

---

## Deployment Readiness Assessment

**Ready for staging**, with one real, previously-undetected bug found and fixed during this pass (see below) — without this fix, the application would have crashed on every container/Railway start. Everything else reviewed was already deployment-appropriate and needed no changes.

### The one real bug found

**Compiled build output landed at the wrong path.** Both `apps/api/tsconfig.app.json` and `apps/worker/tsconfig.app.json` include `packages/shared/src/**/*.ts` alongside each app's own `src/**`. Because those two source trees only share the *repo root* as a common ancestor, TypeScript infers the repo root as the effective build root — so instead of `dist/apps/api/main.js`, the real output landed at `dist/apps/api/apps/api/src/main.js`. The existing `docker/Dockerfile` CMD, `package.json`'s `start:api:prod`/`start:worker:prod`, and `docker-compose.yml` all referenced the wrong (shorter) path.

**Why this was never caught before:** the CI pipeline (`.github/workflows/ci.yml`) runs `npm run build` but never actually executes the built output — it goes straight to `prisma db push` and `db:seed` afterward. Every local dev session in this engagement used `nest start --watch` (an in-memory dev command that never touches `dist/`), never the production start path. This is precisely the kind of bug that only surfaces at first real deployment — which is exactly what this pass caught it for.

**Verified, not assumed:** cleared `dist/` entirely, rebuilt from scratch, confirmed the real output path reproducibly, then fixed `outDir` in both tsconfigs (`dist/apps/api` → `dist`) so the natural structure resolves cleanly to `dist/apps/{api,worker}/src/main.js`. Booted both compiled entry points directly with `node` against a live database and Redis — both reached `"Nest application successfully started"` / `"TimeForge worker started — listening for BullMQ jobs."` with all routes mapped and zero module-resolution errors, proving the fix works at runtime, not just at compile time.

---

## Files Created

| File | Purpose |
|---|---|
| `railway.json` | Railway build/deploy config for the API service (Dockerfile-based build, `prisma migrate deploy` + start command, health check) |
| `.dockerignore` | Was completely absent — the Dockerfile does `COPY . .`, so without this, `.env`, `node_modules`, and `.git` would enter the build context (and risk being baked into an image layer) |
| `docs/DEPLOYMENT.md` | Full step-by-step deployment runbook: backend, worker, frontend, migrations, Redis, env vars, post-deploy verification, rollback |
| `docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md` | The final deployment checklist (see below) |

## Files Modified

| File | Change | Why |
|---|---|---|
| `apps/api/tsconfig.app.json`, `apps/worker/tsconfig.app.json` | `outDir` corrected | Root-caused the build-output bug above |
| `docker/Dockerfile`, `docker-compose.yml`, `package.json` | Updated to the corrected build-output path | Kept in sync with the tsconfig fix |
| `apps/api/src/config/configuration.ts` | API port now prefers platform-injected `PORT`, falls back to `API_PORT` | Railway/Render/Fly.io/Heroku all inject `PORT` and expect the app to bind to it — the app previously ignored it entirely |
| `apps/api/src/app.module.ts`, `apps/worker/src/worker.module.ts` | BullMQ's Redis connection now sets `tls: {}` automatically for `rediss://` URLs | Several managed Redis providers (Upstash, some Railway configs) require TLS; the existing manual host/port/password decomposition silently dropped TLS. (The separate raw `ioredis` client in `infra.module.ts` already handled this correctly by passing the full URL string — only the two BullMQ registrations needed the fix.) |
| `.env.example`, `apps/web/.env.example` | Documented `PORT`'s precedence, `CORS_ORIGINS`'s dual purpose (CORS + password-reset/verification email links), and the previously-undocumented `NEXT_PUBLIC_SUPABASE_*` frontend variables | Task explicitly required every variable be documented |
| `apps/web/.gitignore` | Added `!.env.example` exception | **Found during this pass**: `apps/web/.env.example` was silently gitignored this whole time (its own `.gitignore` blanket-excludes `.env*` without the exception the root `.gitignore` has) — it had never actually been committed. Now tracked. |

Nothing else needed changing — `env.validation.ts`, the health endpoint, Swagger setup, helmet/CORS/rate-limiting middleware, logging (pino, redacts auth headers), and the `prisma:deploy` script were all already correct and production-appropriate.

---

## Production Build Verification

| Check | Result |
|---|---|
| API build (`nest build api`) | ✅ 0 errors |
| Worker build (`nest build worker`) | ✅ 0 errors |
| Frontend build (`next build`) | ✅ 0 errors, all 43 routes generated |
| `npx tsc --noEmit` (web, api, worker — each checked independently against its own tsconfig) | ✅ 0 errors across all three |
| `npx prisma validate` | ✅ schema valid |
| Compiled API boots (`node dist/apps/api/src/main.js`) | ✅ "Nest application successfully started", listening, all routes mapped |
| Compiled worker boots (`node dist/apps/worker/src/main.js`) | ✅ "TimeForge worker started — listening for BullMQ jobs." |
| Lint (`npm run lint`) | ⚠️ **Not verified** — no ESLint config file exists anywhere in this repo's git history (confirmed via `git log --all` on `.eslintrc*`/`eslint.config*` — zero results). This is a pre-existing gap, not something this session introduced or broke. Doesn't block deployment (lint isn't part of the build), but is worth fixing separately. |
| Full containerized `docker build` | ⚠️ **Not verified this session** — Docker Desktop's daemon didn't come up in this sandbox despite an attempted launch. The equivalent native build (same `npm install`/`prisma generate`/`npm run build` steps the Dockerfile runs) was fully verified instead, including actually booting the compiled output — functionally the strongest available proof short of the container itself. |

---

## Recommended Hosting Architecture

- **Frontend**: Vercel, Root Directory `apps/web` (standalone package, zero monorepo config needed)
- **API**: Railway, Dockerfile-based (`railway.json` provided), health check at `/api/v1/health`
- **Worker**: Railway, second service from the same repo/Dockerfile, start command overridden to the worker entry point
- **Database**: existing Supabase Postgres project (`rfwqxeboudsjykhghbjk`) — reuse it, don't provision a new one
- **Redis**: Railway's Redis plugin (simplest) or Upstash (if TLS/serverless-Redis pricing is preferred — now supported via the `rediss://` fix above)

## Remaining Manual Deployment Steps

Everything in `docs/DEPLOYMENT.md` requires actual account access this session doesn't have:
1. Create the Railway project, connect the GitHub repo, add the Redis plugin
2. Set all environment variables on both Railway services (full list in `.env.example`) — **generate real `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` values**, don't reuse dev ones
3. Create the Vercel project, connect the same repo with Root Directory `apps/web`
4. Set `NEXT_PUBLIC_API_URL` on Vercel once the Railway API has a public URL
5. Set `CORS_ORIGINS` on Railway once Vercel has a public URL (circular dependency between the two — deploy API first, then frontend, then go back and set `CORS_ORIGINS`)
6. Run through `docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md` end to end after first deploy
7. Separately: add an ESLint config if lint enforcement is wanted in CI (pre-existing gap, not deployment-blocking)
8. Separately: a full `docker build` should be run once on a machine with a working Docker daemon before fully trusting the container path, even though the equivalent native steps all passed

## Final Recommendation

**Ready to deploy to staging.** The one genuine deployment-blocking bug (compiled output path mismatch) is fixed and verified by actually booting the corrected build, not just by re-running `tsc`. Every other reviewed area (Docker config, env validation, Prisma, Redis/BullMQ, health endpoints, logging, Swagger, security middleware) was already correct and required no changes. The remaining steps are account-setup actions only the user can perform (Railway/Vercel dashboard access), not further code changes.
