# HeroTime — Project Status Snapshot

Last updated: 2026-08-11

**All client feature gaps are closed. The project is production-deploy ready.**

---

## Quick orientation

```
timeforge/
├── apps/
│   ├── api/          # NestJS 10 (port 3000) — backend API
│   ├── worker/       # BullMQ consumers — AI, exports, notifications
│   └── web/          # Next.js 16 App Router (port 3001) — frontend
├── packages/shared/  # Permission catalog, enums, DTOs
├── prisma/           # Schema, 0_init baseline migration, seed.ts
├── docs/             # Contracts, release checklist, design system
└── docker-compose.yml
```

---

## What's been completed

### All 5 feature gaps (from README priority list)

| Gap | What was built | Key files |
|-----|---------------|-----------|
| 1. Attachments | Real file upload (POST/DELETE `/time-entries/:id/attachments`) via `UploadService` | `apps/api/src/modules/time-tracking/`, `UploadService` |
| 2. AI config admin | Per-feature toggle screen at `/admin/ai-config`, runtime enforcement in `AiService.triggerJob()` | `AdminService.getAiConfig()`, `AiConfigContent.tsx`, `navigation.service.ts` (SYSTEM section) |
| 3. Task field | `TimeEntry.task` stored separately from description | `time-tracking.service.ts`, `WorkDetailsCard.tsx`, `CurrentSessionCard.tsx` |
| 4. Department on entries | Overridable `departmentId` FK per time entry, falls back to user's profile department | `TimeEntry` model, `organization.service.ts` aggregation |
| 5a. Recurring blockers | Rule-based flag (3+/5 last entries) + red badge in scrum UI | `scrum.service.ts:attachRecurringBlockerFlag()`, `TeamScrumSubmissionsContent.tsx` |
| 5b. KPI audit | Confirmed `KpiMetricType` (COUNT/HOURS/PERCENT/CURRENCY) covers all brief examples — no change | `packages/shared/` |
| 6. Daily Rate Basis | Support `HOURLY` and `DAILY` rate basis, daily pay calculations (`days_worked × daily_rate`), Admin/Profile rate UI, PDF/Excel/CSV exports | `schema.prisma`, `payroll.service.ts`, `ProfessionalDetailsCard.tsx`, `PayrollProcessingContent.tsx` |

### Production hardening

| Area | Status | Details |
|------|--------|---------|
| Rate limiting | ✅ | `@nestjs/throttler` — 120 req / 60s global |
| Exception filter | ✅ | `AllExceptionsFilter` — structured `{ success, error, code }`, no stack leakage |
| RLS | ✅ | `scripts/apply-rls.js` — run `npm run db:rls` after deploy |
| Migrations | ✅ | Squashed to a single `0_init` baseline (see [Migration baseline](#migration-baseline)) |
| Tests | ✅ | `jest.config.ts` + 36 suites / 378 tests, all backend. `apps/web` still has none — it is covered only by typecheck and lint |
| CI | ✅ | `.github/workflows/ci.yml` — `build` job (api/worker + Prisma + seed + `npm test`) and `web` job (typecheck + lint). See [CI gate](#ci-gate) |

### Other fixes completed during gap work

- `Toast.tsx` — added missing `"info"` tone type
- `Me` interface — added `createdAt`, `supervisor`, `avatarUrl`
- `AttendanceReportsContent.tsx` — fixed Select `undefined` first-paint bug
- `MyProfileContent.tsx` — type cast for form state
- Sidebar nav — added AI Settings under SYSTEM section

### Time tracking & payroll work, August 2026 (PRs #138–#143)

| Area | What changed | Key files |
|---|---|---|
| **Split shifts** (BUG-BX) | A day is many sessions, bounded by *cumulative* worked minutes rather than "a session already ended". Time In returns after Time Out, `sessionOrdinal` lands in the audit trail, and the scrum plan lock reopens only for session 2+ | `work-sessions.service.ts` (`dailyTotals`, `sessionDeadline`), `CurrentSessionCard.tsx` |
| **Daily hours cap** | `ShiftConfiguration.maxDailyMinutes` — its own setting, **distinct from `maxShiftMinutes`** (which bounds one continuous session and drives auto-clock-out/override). Null falls back to `maxShiftMinutes`. Existing orgs backfilled to 480 | `schema.prisma`, `work-sessions.service.ts` |
| **DTR daily log** (BUG-BW) | Immutable `SessionEvent` rows (`CLOCK_IN`/`BREAK_START`/`BREAK_END`/`CLOCK_OUT`) behind `GET /work-sessions/daily-log/:date`. Read-only by construction — no endpoint edits or deletes one | `work-sessions.service.ts`, `DailyLogCard.tsx` |
| **Timesheet timeline** | Reads those recorded events instead of inferring breaks from gaps between entries. Gaps *between* sessions are no longer counted as break time | `day-summary.ts` (`timelineFromSessionEvents`) |
| **Team Productivity** (BUG-BZ) | Was empty for Admin/HR: employees were scoped to departments the caller *manages*, which is none for them. Org readers now see the organization; supervisors unchanged | `reports.service.ts` (`productivityUserScope`) |
| **13th-month settings** (BUG-BY) | `PayrollSettings.thirteenthMonthIncludesDeMinimis` + `GET`/`PUT /payroll/settings/13th-month`. The tracker resolves policy per request — no cache, no recalculation step | `payroll-settings.service.ts`, `compensation-benefits.service.ts`, `PayrollSettingsContent.tsx` |

Two traps found the hard way, both with regression tests pinning them:

- `ReportsService.validateScope()` **mutates** `query.departmentId`, overwriting
  it with the supervisor's own department — which is not necessarily one they
  manage. Narrowing on that field empties the report for supervisors.
- `summarizeDay()` treats any gap ≥ `MIN_BREAK_MINUTES` as a break. With split
  shifts that turned a 5-hour off-clock gap into "Break 5h 00m" and a 13-hour
  day. Gaps now only count within a single `workSessionId`.

---

## Architecture invariants (don't break these)

- **Tenant isolation**: JWT → AsyncLocalStorage → Prisma middleware → RLS (4 layers)
- **Idempotency**: `Idempotency-Key` header required on bulk/payroll/AI endpoints
- **Audit trail**: Every mutating action on payroll/HR/AI writes `AuditLog` + `Notification`
- **RBAC**: `@RequirePermissions` guard; sidebar is partly role-scoped, not purely permission-scoped
- **Currency**: PHP (₱) everywhere — never $
- **Finance shell**: Separate `FinanceAppShell` with hardcoded nav — doesn't share main `AppShell`

---

## Bug-fix workflow

Follow this process for every bug fix in this repo:

1. **State scope first.** Before making any change, state which files you intend to touch and why. Do not touch any file outside that list without asking first.
2. **Read before editing.** Read the existing code path fully before editing — don't guess at function signatures or DB schema.
3. **Smallest fix wins.** Make the smallest change that fixes the described bug. Do not refactor, rename, or "clean up" unrelated code in the same file.
4. **Verify with tests.** After the change, run any existing relevant tests (`npm run test` for the affected app) and confirm they pass. If no test covers this path, note that explicitly rather than skipping verification.
5. **Summarize impact.** Summarize exactly what changed (files + diff summary) and explicitly call out any other feature/module that could be affected by this change, so it can be spot-checked.
6. **Migrations, not hand edits.** If the fix requires a schema change, generate a Prisma migration — don't hand-edit the DB.

---

## CI gate

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`, as two parallel jobs:

| Job | Covers |
|-----|--------|
| `build` | `npm run build` (nest build api + worker), Prisma generate/push, seed, `npm test` — needs Postgres + Redis services |
| `web` | `apps/web` — `next typegen`, then `tsc --noEmit --incremental false`, then `eslint .` |

`apps/web` is a **separate npm project** with its own `package-lock.json` — it is not an npm workspace, so it needs its own `npm ci` inside `apps/web`.

### Reproducing the web job locally

```bash
cd apps/web && npx next typegen && npx tsc --noEmit --incremental false && npx eslint .
```

### Three traps — all of these have bitten before

- **Always pass `--incremental false`.** `tsconfig.json` sets `incremental: true`, so a bare `tsc --noEmit` can be served by a stale `tsconfig.tsbuildinfo` and check only a subset of files. This has produced a false all-clear on a genuinely broken tree.
- **`next build` is not a type gate.** `next.config.ts` sets `typescript.ignoreBuildErrors: true` — the build compiles straight past type errors. `tsc` must be invoked explicitly.
- **Run `next typegen` first.** `next-env.d.ts` and the `.next/types/routes.d.ts` it imports are both generated and gitignored, so on a clean checkout `tsc` cannot resolve the reference and fails for reasons unrelated to your code.

Lint gates on **errors only**. There are ~186 pre-existing warnings; don't add `--max-warnings 0` without a cleanup pass first.

---

## Migration baseline

`prisma/migrations/` holds a single `0_init` migration generated from
`schema.prisma`. The 33 migrations that preceded it were squashed on
2026-08-03; they remain in git history at commit `7dd1a5e` if you ever need to
read one.

**Why.** The old history was not replayable. Early schema work was done with
`db push`, and migrations written afterwards referenced objects no migration
ever created — 16 tables and 18 enums, including `notifications` and the
`notification_type` enum. `prisma migrate deploy` against an empty database
died on the third migration (`relation "scrum_entries" does not exist`), so new
environments could not be provisioned from migrations and `migrate dev` could
not build a shadow database. That is fixed: `migrate deploy` now bootstraps an
empty database and `npm run db:seed` populates it.

**If you are baselining another existing environment** (one whose schema is
already current but whose `_prisma_migrations` predates the squash):

```bash
npx prisma migrate resolve --applied 0_init
```

Then delete the superseded rows — they are inert, since Prisma ignores rows
with no matching local folder, but they are misleading:

```sql
DELETE FROM _prisma_migrations WHERE migration_name <> '0_init';
```

Never edit an already-applied migration file. Prisma stores a checksum of each
one, and a modified file makes `migrate deploy` fail on every environment that
already ran it.

### The drift came back once — don't let it happen again

By 2026-08-11 the same problem had re-accumulated: `grievances`, three enums,
`timesheets.payment_status`, `timesheets.payroll_period_id`,
`payroll_periods.is_auto_generated`, two FKs, two indexes and two index renames
existed in production and in `schema.prisma` but in **no migration**. A database
provisioned from migrations was missing a table the API queries, and every
`migrate dev` tried to regenerate the whole backlog — two migrations had to be
hand-trimmed before shipping because of it.

`20260811070000_reconcile_db_push_drift` closes that gap. Its SQL is generated,
not hand-written:

```bash
npx prisma migrate diff --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma --script
```

**The cause was `prisma db push` against a database whose schema is tracked by
migrations.** Use it only on a throwaway local database. Anywhere shared, the
schema change must be a migration, or the next person gets a `migrate dev` that
wants to recreate objects production already has.

**Check before writing a migration.** If this returns anything, the tree has
drifted again and needs reconciling before you add to it:

```bash
npx prisma migrate diff --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma \
    --shadow-database-url <throwaway-db-url> --script
```

An environment that already has the objects records the migration instead of
running it (running it fails on `CREATE TYPE`/`CREATE TABLE`):

```bash
npx prisma migrate resolve --applied 20260811070000_reconcile_db_push_drift
```

Verify production matches the schema *before* resolving — an empty result here
is what makes "mark as applied" honest rather than a paper-over:

```bash
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
```

## Role permission scripts

Two scripts write `RolePermission` rows, and they are **not** interchangeable:

| Command | Script | Behaviour |
|---|---|---|
| `npm run db:sync-permissions` | `prisma/scripts/sync-role-permissions.ts` | **Additive.** Grants permissions added to `ROLE_PERMISSIONS`, never revokes. This is the routine deploy step. |
| `npm run db:reset-permissions` | `scripts/reset-role-permissions.ts` | **Destructive.** Deletes and rebuilds every system role's grants across all tenants, discarding admin customisations. Deliberate resets only. |

`ROLE_PERMISSIONS` in `packages/shared/src/permissions.ts` is read only at seed
time — live permissions are rows in `role_permissions`. A role that gains a
permission in code keeps 403ing until `db:sync-permissions` runs.

## Supabase integration

Supabase is used as **managed PostgreSQL + object storage** only — NOT Supabase Auth (custom JWT/RBAC).

### Database (primary use)
- PostgreSQL hosted on Supabase (project `rfwqxeboudsjykhghbjk`)
- Pooled connection: `DATABASE_URL` via Supavisor (port 6543)
- Direct connection: `DIRECT_URL` for migrations/seeding/RLS (port 5432)
- Prisma ORM manages schema via migrations — no direct Supabase DB management
- Both connect as `postgres`, which on Supabase is **not a superuser** but does
  hold `BYPASSRLS`. That attribute — not superuser status — is why the API reads
  through every RLS policy. Don't repoint the API at `timeforge_app`
  (`BYPASSRLS = false`) without reading the note in `prisma/sql/rls.sql` §4:
  policies key on `app.tenant_id`, which only `withTenant()` sets, so ordinary
  Prisma calls would silently return zero rows.

### Storage (provider-swappable)
- `apps/api/src/modules/storage/` — abstracted behind `StorageProvider` interface
- Provider selected by `STORAGE_DRIVER` env var: `local` (dev default) or `supabase`
- `SupabaseStorageProvider` (`apps/api/src/modules/storage/providers/supabase-storage.provider.ts:18`) uses `SUPABASE_SERVICE_ROLE_KEY` server-side only
- Bucket name: `TimeForge` (`SUPABASE_STORAGE_BUCKET`) — case-sensitive; this is the only bucket on the project
- Logical folders: `avatars`, `scrum-attachments`, `reports`, `exports`, `documents`
- Used by: avatar uploads, time-entry attachments, scrum attachments, report/payroll/performance exports

### Edge functions
- One function deployed: `send-email` (`supabase/functions/send-email/index.ts`)
- Written in Deno, sends transactional emails via Nodemailer + Google SMTP
- Called from `MailerService` (`apps/api/src/infra/mailer.service.ts:34`) when `SUPABASE_SERVICE_ROLE_KEY` is set
- Falls back to direct SMTP or console mock if Supabase credentials absent

### Realtime
- `NotificationsRealtimeService` (`apps/api/src/modules/notifications/notifications-realtime.service.ts`) uses Supabase Realtime Broadcast for push notifications
- Per-user channels (`notifications:user:{userId}`) — client subscribes to own channel only
- Deliberately uses Broadcast (not Postgres Changes/RLS) because auth is custom JWT, not Supabase Auth

### CLI
- Project linked via `supabase link` — `.temp/linked-project.json` exists
- No `supabase/config.toml` committed — edge function deployment was manual or config not persisted
- To deploy edge function: `supabase functions deploy send-email --project-ref rfwqxeboudsjykhghbjk`

---

## Key file locations for future work

| Need | File |
|------|------|
| Auth principal type | `apps/api/src/common/decorators/index.ts:13` |
| Permission constants | `packages/shared/src/permissions.ts` |
| Sidebar nav catalog | `apps/api/src/modules/navigation/navigation.service.ts` |
| AI feature toggles | `apps/api/src/modules/ai/dto.ts` (feature list), `AdminService.getAiConfig()` (read), `AiService.checkFeatureEnabled()` (enforce) |
| Scrum recurring-blocker | `apps/api/src/modules/scrum/scrum.service.ts` (`attachRecurringBlockerFlag`) |
| Time entry service | `apps/api/src/modules/time-tracking/time-tracking.service.ts` |
| Clock in/out, breaks, daily totals | `apps/api/src/modules/work-sessions/work-sessions.service.ts` |
| Shift limit / auto-clock-out | `apps/api/src/modules/shift-limits/shift-limits.service.ts` |
| Day aggregation & activity timeline | `apps/web/features/time-tracking/lib/day-summary.ts` |
| Payroll settings (statutory + 13th-month) | `apps/api/src/modules/payroll/payroll-settings.service.ts` |
| Report scoping (org vs supervisor) | `apps/api/src/modules/reports/reports.service.ts` |
| Prisma tenant middleware | `apps/api/src/common/prisma/prisma.service.ts` |
| Exception filter | `apps/api/src/common/filters/all-exceptions.filter.ts` |
| RLS script | `prisma/sql/rls.sql` |
| Organisation settings | `apps/api/src/modules/organization/organization.service.ts` |

---

## Remaining / future considerations (not blockers)

1. **Deliverables field** — the brief mentions a dedicated Deliverables field on time entries. Not implemented, was lowest priority.
2. **Open-ended KPI metric types** — `KpiMetricType` is a fixed 4-value enum. Brief may want free-text. Was confirmed as stretch goal.
3. **Test coverage** — 36 suites / 378 tests, all backend. There are still no
   frontend tests at all; `apps/web` is covered only by typecheck and lint, so
   any UI change needs verifying by running the app.
4. **Lint warnings** — `apps/web` carries ~186 eslint warnings (mostly
   `no-explicit-any` and unused vars). CI gates on errors only; `--max-warnings 0`
   would need a cleanup pass first.
5. **`ignoreBuildErrors`** — `apps/web/next.config.ts` still sets
   `typescript.ignoreBuildErrors: true`, so Vercel deploys even with type errors.
   CI catches them pre-merge, but dropping this flag would close the gap properly.
6. **Duplicate Vercel project** — `time-forge-n2gg` fails on every commit (Root
   Directory is the repo root, so Next can't be detected), which makes every PR
   look partly red. `time-forge` is the working one. Delete or repoint the
   duplicate; the root `vercel.json` exists only to serve it.
7. **OpenAI key** — Worker falls back to stub mode when `OPENAI_API_KEY` is
   absent. Not a bug, but production needs the real key.
8. **Seed data** — Demo accounts use `ChangeMe123!` — rotate before production.
9. **New tenants get no daily cap.** The `maxDailyMinutes` backfill covered
   existing orgs only; an org created since inherits `NULL` and falls back to
   `maxShiftMinutes` (12h seeded). Onboarding has to set it deliberately.
10. **13th-month: only one of three toggles exists.** "Deduct unpaid absences"
   has nothing to act on — the base is `regularPay`, derived from time actually
   worked, so absences are already excluded and a deduction would double-count.
   "Include maternity leave" is not expressible: `LeaveType` is
   `ANNUAL | SICK | PERSONAL` and payroll reads no leave data. Both need schema
   work before they can mean anything.
11. **A session starting near the daily cap opens in `WARNING`.** With 30 minutes
   granted and `warningLeadMinutes` at 60, the employee gets an "approaching your
   shift limit" notification at clock-in. Accurate, but a new notification moment.

---

## How to start

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # `db push` ONLY on a throwaway local DB — see Migration baseline
npm run db:seed
npm run start:api            # terminal 1
npm run start:worker         # terminal 2
npm --prefix apps/web run dev  # terminal 3
```

Login with `admin@demo.test` / `ChangeMe123!` → Swagger at `http://localhost:3000/api/docs`.
