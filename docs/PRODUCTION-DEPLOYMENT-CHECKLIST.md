# Production Deployment Checklist

Run through in order. Full steps for each item are in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

## Infrastructure
- [ ] Backend deployed (Railway API service — `railway.json` builds via `docker/Dockerfile`)
- [ ] Worker deployed (Railway second service, same repo, start command overridden to `node dist/apps/worker/src/main.js`)
- [ ] Frontend deployed (Vercel, Root Directory = `apps/web`)
- [ ] Database migrated (`npx prisma migrate deploy` — runs automatically on API boot per `railway.json`; confirm via `npx prisma migrate status` shows no pending migrations)
- [ ] Redis connected (both API and worker point at the **same** Redis instance; confirm no `ECONNREFUSED`/`Redis version` errors in either service's logs)
- [ ] BullMQ running (worker logs show `"TimeForge worker started — listening for BullMQ jobs."` with no startup errors)

## Configuration
- [ ] AI provider configured (`OPENAI_API_KEY` set; `AI_PROVIDER=OPENAI`)
- [ ] SMTP configured (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` set — or intentionally left blank for console-mock mode, documented as such)
- [ ] Storage configured (`STORAGE_DRIVER=supabase` with `SUPABASE_SERVICE_ROLE_KEY` set, if moving off local disk storage)
- [ ] Environment variables configured on both Railway services and Vercel (cross-check every var in `.env.example` / `apps/web/.env.example` is present — none left as dev placeholders)
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are real generated secrets, not the dev defaults (`env.validation.ts` refuses to boot with placeholders when `NODE_ENV=production` — a failed boot here is expected and correct, not a bug)
- [ ] `COOKIE_SECURE=true`
- [ ] `CORS_ORIGINS` set to the exact deployed Vercel domain

## Health & Connectivity
- [ ] Health checks passing (`GET /api/v1/health` → `{"status":"ok","db":"up"}`)
- [ ] Swagger reachable (`GET /api/docs`)
- [ ] Frontend loads with no console errors, no blank screen after login

## Functional Verification
- [ ] Authentication verified (login, logout, session persistence across reload, access-token refresh)
- [ ] RBAC verified (each of the 5 roles redirects to its correct dashboard; sidebar and user-dropdown items match role permissions)
- [ ] Finance verified (sidebar shows exactly Dashboard / Payroll Processing / Financial Reports / AI Insights; dashboard shows real data)
- [ ] Payroll verified (processing wizard steps through DRAFT → VALIDATED → APPROVED → SENT_TO_BANK)
- [ ] AI modules verified (trigger one real AI report job, confirm it reaches `SUCCEEDED`)
- [ ] Notifications verified (the AI job above, or a leave/timesheet approval, produces a real notification and the unread count updates)
- [ ] Reports verified (at least one export — CSV, Excel, or PDF — downloads successfully)

## Sign-off
- [ ] All boxes above checked by whoever ran the deploy
- [ ] Rollback procedure (`docs/DEPLOYMENT.md` §8) reviewed and understood before going live
