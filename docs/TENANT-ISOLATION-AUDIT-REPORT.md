# Tenant Isolation Audit Report

**Date:** 2026-07-10
**Scope:** Finding #5 from the Production Readiness Tracker (High) — Prisma tenant-scoping middleware covering only a fraction of tenant-scoped models.
**Status:** ✅ Fixed and verified live. One additional finding (RLS bypass) documented, not silently fixed — see §5.

---

## 1. Problem

`PrismaService`'s `$use` middleware auto-injects `tenantId` into every query for models listed in a `TENANT_MODELS` set — the "developer-proof" layer that stops a missed manual `tenantId` filter from becoming a cross-tenant data leak. The set only listed 12 models (`Organization`, `OrganizationSetting`, `User`, `Role`, `RefreshToken`, `AuditLog`, `IdempotencyKey`, `Notification`, `AiJob`, `AiResult`, `LeaveRequest`, `LeaveBalance`).

The actual schema has **36** models with a `tenantId` field. The other 24 — including `TimeEntry`, `Timesheet`, `PayrollPeriod`, `PayrollReport`, `PayrollLineItem`, `Project`, `Client`, `Department`, `Team`, `WorkCategory`, `Holiday`, `ScrumEntry`/`ScrumTask`/`ScrumBlocker`, `WorkSession`/`SessionEvent`/`SessionAttachment`, `Shift`, `Approval`, `KpiTemplate`, `KpiProgress`, `AiAudit`, `SecurityLog`, `SecurityAlert`, `GeneratedReport` — got no automatic filtering at all. Every service touching them had to get `tenantId` right manually, every time, with nothing catching a mistake.

## 2. Fix

### 2a. Expanded `TENANT_MODELS`
`apps/api/src/common/prisma/prisma.service.ts` — `TENANT_MODELS` now lists all 36 tenant-scoped models, derived by grepping every `model` block in `prisma/schema.prisma` for a `tenantId String @map("tenant_id")` field.

### 2b. A test that keeps it that way
`apps/api/src/common/prisma/prisma.service.spec.ts` — parses `prisma/schema.prisma` directly at test time, extracts every tenant-scoped model name, and asserts it matches `TENANT_MODELS` exactly (both directions: nothing missing, nothing stale). This is the actual "remove the gap that relies on developer discipline" fix at the meta level — a future model with `tenantId` that isn't registered now fails CI instead of silently shipping unscoped.

### 2c. RLS coverage gap found and fixed
Cross-checked `prisma/sql/rls.sql`'s `tenant_tables` array against the same 36-model list. **`leave_requests` and `leave_balances` were missing** — added in the Leave Management module (migration `20260709000000_add_leave_module`) after the RLS script was last touched. Confirmed live via `pg_class.relrowsecurity`: both tables had `false` — genuinely zero RLS protection in production. Fixed the array and re-ran `npm run db:rls` against the live database; both tables now show `relrowsecurity: true, relforcerowsecurity: true` with the correct `tenant_isolation` policy.

## 3. What was verified NOT to need scoping (checked, not assumed)

- `Permission`, `RolePermission`, `UserRole` — global catalog / pure join tables, no `tenantId`. Correctly excluded from both `TENANT_MODELS` and RLS (documented in `rls.sql`'s own trailing comment).
- `Tenant` — the root table; has its own separate `tenant_self` RLS policy (`id = current_setting('app.tenant_id')`), not part of the generic loop. Confirmed still enabled.

## 4. Live Verification

This went through a real methodology dead-end worth recording: an initial synthetic `ts-node` script (calling `runWithContext(ctx, () => prisma.model.findMany(...))` directly, outside any HTTP request) showed `tenantId: undefined` inside the middleware even for *originally-covered* models — which would have meant the entire tenant-scoping system had never worked at all. Rather than trust that, it was checked against the real running server instead:

1. Temporarily added a debug log inside the actual middleware, gated behind `DEBUG_TENANT_MW=1`.
2. Started the real API server with that flag, logged in as `admin@demo.test` through a real HTTP request (`POST /auth/login`), then called `GET /notifications/unread-count` (an originally-covered model) and `GET /kpi/templates` (a **newly-covered** model, previously unscoped).
3. Server logs showed `tenantId: 'b6756dc7-...'` correctly populated for both `Notification count` and `KpiTemplate findMany` — the middleware works correctly for both old and newly-added models in the real request pipeline.
4. The synthetic script's failure was a test-harness artifact (AsyncLocalStorage context propagation through a bare `runWithContext(ctx, () => promise)` call outside a live Express/Nest request lifecycle) — not a real bug. Recorded here so it isn't rediscovered and mistaken for a regression later.
5. Debug instrumentation fully removed from both `prisma.service.ts` and `.env` after verification.
6. `npx prisma validate`, `tsc --noEmit` (all three apps), and the full `jest` suite (9/9 tests, including the new coverage-guard spec) all pass. API boots cleanly with all routes mapped.

## 5. Additional finding: RLS is currently a no-op for the live app (not fixed — flagged)

While verifying RLS, found that the database role in `DATABASE_URL`/`DIRECT_URL` (`postgres`, the Supabase project's default role) has `rolbypassrls: true`. Postgres roles with `BYPASSRLS` ignore every RLS policy on every table unconditionally — `FORCE ROW LEVEL SECURITY` does not override this. Confirmed live: querying `time_entries` with the `app.tenant_id` GUC unset (i.e., the exact condition RLS is supposed to catch) still returned all 50 rows, no filtering applied.

This means: **RLS is enabled, forced, and correctly scoped on all 36 tables (per §2c), but provides zero actual protection today.** The Prisma middleware fixed in §2a is the *only* enforcement layer currently active. `rls.sql` already provisions a restricted `timeforge_app` role without `BYPASSRLS` for exactly this purpose, but the app was never switched to connect as it.

**Deliberately not fixed as part of this change** — switching which database role the entire application authenticates as is an infrastructure/credentials change with real blast radius (a missing grant on any table would break the live app), the script's password is a literal placeholder (`'app_password'`) that would need real secret generation, and the task explicitly asked to avoid breaking changes. Documented in the tracker as a decision needed, not silently changed.

## 6. Result

All 36 tenant-scoped models now get automatic `tenantId` enforcement on `findMany`/`findFirst`/`count`/`aggregate`/`groupBy`/`updateMany`/`deleteMany`/`create`/`createMany` — not just the 12 that happened to be listed before. A regression test keeps this true going forward. RLS policy coverage gaps found during the audit are closed. The one gap that remains (RLS bypass at the connection-role level) is explicitly documented rather than papered over, since fixing it is an infrastructure decision, not a code fix.
