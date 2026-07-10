# Soft-Delete + Unique Constraint Fix Report

**Date:** 2026-07-10
**Scope:** Finding #6 from the Production Readiness Tracker (High) — soft-deleted records blocking creation of new records with the same unique values.
**Status:** ✅ Fixed and verified live.

---

## 1. Problem

Every model below combines a soft-delete column (`deleted_at`) with a unique constraint that did **not** exclude soft-deleted rows. Concretely: soft-delete a user, then try to re-invite them with the same email (a normal HR workflow) — it fails on a unique constraint violation, because the old constraint enforced uniqueness across *all* rows, deleted or not.

## 2. Models Reviewed & Fixed

Audited every model in `prisma/schema.prisma` that has both `deletedAt` and an `@@unique`. 14 affected:

`Organization` (slug), `OrganizationSetting` (key), `User` (email), `Role` (key), `Department` (name), `Team` (name), `Client` (name), `Project` (code), `WorkCategory` (name), `Holiday` (date+name), `ScrumEntry` (entryDate), `KpiTemplate` (name), `KpiProgress` (periodKey), `PayrollPeriod` (startDate+endDate) — all scoped by `tenantId`/`organizationId` as appropriate.

**Explicitly ruled out** (checked, not affected):
- `Organization.[tenantId, id]` and `User.[tenantId, id]` — technical composite-key uniques that support FK references (`id` is always a fresh UUID; can never collide via soft-delete+recreate). Left untouched.
- `IdempotencyKey`, `LeaveBalance`, `PayrollLineItem`, `Permission` — have unique constraints but **no** `deletedAt` field at all, so the bug pattern doesn't apply.

## 3. Fix

Prisma's schema DSL has no syntax for a partial `@@unique` (a known, long-standing Prisma limitation). The fix:

1. **Migration** `prisma/migrations/20260710000000_soft_delete_partial_unique_indexes/migration.sql` — for each of the 14 tables: drop the old full unique index, recreate it as a partial unique index (`WHERE deleted_at IS NULL`), reusing the same index name. Uniqueness is now enforced only among *active* rows.
2. **`prisma/schema.prisma`** — each `@@unique([...])` replaced with an equivalent `@@index([...])` (same columns) plus a comment pointing at the migration. The index still exists for query performance; the actual DB-level uniqueness guarantee now lives only in the migration, which Prisma's schema can't represent.
3. **Two call sites broke and needed refactoring**, because Prisma's `.upsert()` compiles to `INSERT ... ON CONFLICT (columns) DO UPDATE`, and Postgres can't use a partial index as an implicit `ON CONFLICT` arbiter for a bare `(columns)` target:
   - `apps/api/src/modules/kpi/kpi.service.ts` (`upsertProgressFromApproval`, on `KpiProgress`)
   - `apps/api/src/modules/organization/organization.service.ts` (`upsertSetting`, on `OrganizationSetting`)

   Both rewritten from `.upsert()` to a manual `findFirst({ deletedAt: null }) → update/create` branch — the same pattern already used elsewhere in the codebase (e.g. `RolesService`).
4. **Two `findUnique()` calls also broke** — `apps/api/src/modules/auth/auth.service.ts` looked up the registration-default `Organization` via the compound `tenantId_slug` unique (twice, in `register()` and `departmentsForRegistration()`). Both converted to `findFirst({ where: { tenantId, slug } })`.
5. Verified via targeted `grep` across `apps/api` and `apps/worker` that no other `.findUnique()` or `.upsert()` call relies on any of the 14 removed compound-unique keys.

## 4. Safety of Applying to Existing Data

The old (non-partial) constraints already guaranteed there are zero duplicate keys among currently-active rows — a partial index can only be *more* permissive than the full index it replaces, never less. So creating the new partial indexes against existing production data cannot fail and required no data cleanup step.

## 5. Live Verification

Applied via `npx prisma migrate deploy` against the real Supabase database (not a shadow/local DB), then verified concretely — not just typechecked:

1. **Confirmed the index change directly in Postgres** (`pg_indexes` query): all 14 target indexes now show `WHERE (deleted_at IS NULL)`; the two technical `tenantId_id` indexes remain full (unpartitioned), as intended.
2. **Reproduced and fixed the actual bug** for `User` (the case explicitly named in the finding):
   - Created user A with email `X`.
   - Soft-deleted user A.
   - Created user B with the **same email `X`** — previously would fail with Prisma error `P2002`; now **succeeds**.
   - Sanity check: creating a *third* user with an email still held by an **active** (non-deleted) user is still correctly rejected with `P2002` — the real uniqueness guarantee is intact, only the soft-delete interaction changed.
3. **Verified the refactored `OrganizationSetting.upsertSetting` logic end-to-end**: create → update (same row, version incremented) → soft-delete → recreate (new row, same key) — all behaved correctly.
4. `npx prisma validate` — schema valid. `npx prisma generate` — clean. `npx tsc --noEmit` clean across `api`, `worker`, and `web`. API boots successfully with all routes mapped.

## 6. Result

Soft-deleting any of these 14 record types no longer blocks recreating one with the same natural key, while true duplicates among active records are still rejected exactly as before.
