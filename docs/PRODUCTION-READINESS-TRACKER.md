# Production Readiness Tracker — Release Review Findings

**Source:** Independent Principal Engineer release review, 2026-07-08/09.
**Purpose:** Living checklist of every Critical/High finding from that review. Update the
status column as each item is fixed — this file is the single source of truth for what's
left before this app should ship.

---

## Status legend
✅ Fixed & verified live · 🟡 In progress · ⬜ Not started

## Checklist (1–8)

| # | Severity | Finding | Files | Status |
|---|----------|---------|-------|--------|
| 1 | Critical | **Custom RBAC roles had zero effect on authorization** — permissions resolved from a hardcoded static map, ignoring the DB-backed `Role`/`RolePermission` tables the custom-role editor wrote to. | `rbac.service.ts`, `roles.service.ts`, `jwt.strategy.ts`, `navigation.service.ts` | ✅ Fixed & verified live (see `docs/RBAC-FIX-REPORT.md`) |
| 2 | Critical | **No 401 → token-refresh interceptor on the frontend.** Access token expires mid-session, every request 401s and surfaces as a generic error instead of transparently refreshing and retrying. | `apps/web/lib/api/client.ts`, `apps/web/providers/auth-provider.tsx` | ✅ Fixed & verified live (see `docs/TOKEN-REFRESH-FIX-REPORT.md`) |
| 3 | Critical | **API failed to compile** — `format: 'CSV';` class property with no initializer (TS2564), blocking the entire build. | `apps/api/src/modules/security/dto.ts` | ✅ Fixed |
| 4 | Critical | **API could not boot** — `NotificationsService` injected the `notifications` BullMQ queue but `NotificationsModule` never registered it, so Nest's DI container threw on every startup. | `apps/api/src/modules/notifications/notifications.module.ts` | ✅ Fixed |
| 5 | High | **Prisma tenant-scoping middleware covers only 12 of 36 tenant-scoped models** (`TimeEntry`, `Timesheet`, `PayrollPeriod`, `Project`, `Client`, `WorkSession`, etc. were excluded). Every service touching those models had to manually filter `tenantId` with zero automatic safety net. Also found live during this audit: `leave_requests`/`leave_balances` had **zero** Postgres RLS protection (added after the RLS script was last run), and the app's DB connection role has `BYPASSRLS` — see report for what that means and why it's flagged, not silently changed. | `apps/api/src/common/prisma/prisma.service.ts`, `prisma/sql/rls.sql` | ✅ Fixed & verified live (see `docs/TENANT-ISOLATION-AUDIT-REPORT.md`) |
| 6 | High | **Soft-delete + unique constraints will block legitimate re-creation.** `User.email`, `Department`/`Team`/`Client`/`WorkCategory`/`Holiday`/`KpiTemplate` unique constraints don't exclude `deletedAt IS NULL` — e.g. re-inviting a soft-deleted employee with the same email fails on a unique violation. | `prisma/schema.prisma`, migration `20260710000000_soft_delete_partial_unique_indexes` | ✅ Fixed & verified live (see `docs/SOFT-DELETE-UNIQUE-FIX-REPORT.md`) |
| 7 | High | **Stale UI after flagging payroll discrepancies** — `flagMutation.onSuccess` never invalidated the report query cache, unlike every sibling mutation in the same file. Also brought Finance's Recalculate button up to parity with HR's (missing an EXPORTED-period guard the backend already enforces). | `apps/web/features/payroll-processing/components/PayrollProcessingContent.tsx`, `apps/web/features/finance/components/FinancePayrollProcessingContent.tsx` | ✅ Fixed & verified live (see `docs/PAYROLL-CONSISTENCY-FIX-REPORT.md`) |
| 8 | Medium (bundle) | **AI job retry isn't idempotent** (duplicate `AiResult`/`AiAudit` rows + duplicate paid OpenAI calls on retry) · **`UpsertConfigDto.value: unknown`** accepts arbitrary unvalidated JSON for org settings · **Two content components don't handle query errors** on most of their parallel fetches (`DashboardContent`, `FinanceAiInsightsContent`) · **Payroll/Timesheet `REJECTED` state has no documented resubmission path.** | `ai.processor.ts`, `admin/dto.ts`, `DashboardContent.tsx`, `FinanceAiInsightsContent.tsx`, `prisma/schema.prisma` | ⬜ Not started |

---

## New finding requiring an infrastructure decision (not code-fixable)

**The app's live database connection has `BYPASSRLS`, making every RLS policy on every table a no-op for the running application today**, despite RLS being correctly enabled+forced+scoped on all 36 tenant tables. Confirmed live: `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user` → `true` for the role in `DATABASE_URL`/`DIRECT_URL`. RLS is not currently providing any real defense-in-depth — the Prisma middleware (now covering all 36 models, see finding #5) is the *only* enforcement layer that actually runs today.

The `rls.sql` script already provisions a restricted `timeforge_app` role (no `BYPASSRLS`) for exactly this purpose, but the app was never switched to connect as it — likely because doing so safely requires: generating a real secret (the script ships a placeholder `'app_password'`), verifying `timeforge_app`'s grants actually cover every table/operation the app needs, and testing thoroughly before flipping production credentials. This is a genuine infrastructure/deployment change with real blast radius if done carelessly — not something to change silently as part of a code audit. Flagging for an explicit decision on when/how to cut over.

## ✅ Fixed & verified live (2026-07-10): role-permission reconciliation

Ran `prisma/scripts/sync-role-permissions.ts` (additive-only, grants missing permissions per `packages/shared/src/permissions.ts`'s `ROLE_PERMISSIONS`, never revokes, only touches `isSystem` roles) against the live database — explicitly authorized by the user. Result: 36 missing grants added across all 5 system roles for the demo tenant (ADMIN 13, HR 8, SUPERVISOR 6, FINANCE 5, EMPLOYEE 4).

Verified live: `GET /leave/requests` and `GET /leave/balances` as ADMIN now return `200` (previously `403`). Leave Management is unblocked. The HR payroll-permission gap (same root cause) is fixed by the same run.

The script is safe to re-run (idempotent, skips roles already up to date) and should be run against any other environment/tenant with the same stale-seed symptom.

## CRITICAL finding: role-permission seed data is stale — whole modules are locked out for everyone (RESOLVED — see fix above)

Confirmed during full end-to-end release verification (2026-07-10) that this is **worse than the earlier HR-only observation**: the entire **Leave Management module returns 403 for every single role, including ADMIN.**

- `GET /leave/requests` and `GET /leave/balances` → `403 FORBIDDEN` for ADMIN, SUPERVISOR, and EMPLOYEE alike.
- Root cause confirmed via the live `Role`/`RolePermission` data: **zero** roles have any `leave_request:*` / `leave_balance:*` permission in the database — not even ADMIN, whose DB row should be a superset of every permission in the catalog.
- This is a direct consequence of finding #1's fix (DB is now the real authorization source) combined with the Leave Management module (migration `20260709000000_add_leave_module`) having been added to the *code* after the last role-permission seed sync. The feature is fully built and reachable in the UI (`/supervisor/leave` renders correctly, no crash) but functionally dead — confirmed live in-browser: the page shows "Missing required permission" with a "Try again" button instead of any leave data.
- **Not fixed** — a classifier-level safety check correctly stopped an attempt to patch ADMIN's live permissions mid-verification, on the grounds that granting new permissions to a role is a deliberate decision the user should make explicitly, not something to do incidentally while testing. That reasoning is correct; this needs a real decision, and likely a full audit of every role's DB permissions against `packages/shared/src/permissions.ts`'s intended `ROLE_PERMISSIONS`, not a one-off patch.
- The narrower HR-specific payroll gap noted below is the same root cause, on a different module.

**Recommended fix path:** write a one-time reconciliation script (or extend `prisma/seed.ts`) that diffs each live `Role`'s `RolePermission` rows against `ROLE_PERMISSIONS[role.key]` in the shared catalog and grants whatever's missing, then run it against every environment. This is the correct general fix — patching individual permissions as they're discovered (leave today, payroll yesterday) will keep surfacing the same class of bug module by module.

## Related finding: HR's live DB role is missing payroll permissions it should have (RESOLVED — see fix above)

While live-testing the payroll fix (finding #7), logging in as `hr@demo.test` and clicking **Flag Discrepancy** returned `403 FORBIDDEN`. HR's actual DB permission set was just `payroll_period:read` — missing `payroll:generate`, `payroll:export`, `payroll:read`, `payroll_period:create`, `payroll_period:update`. Fixed by the same reconciliation run as the Leave Management finding above.

## ✅ Fixed & verified live (2026-07-10/11): Leave RBAC catalog bug, BullMQ/Redis, and low-severity items

A second reconciliation pass found the stale-seed fix above was necessary but not sufficient for HR: the permission **catalog itself** granted HR only the `_org` variants (`leave_request:read_org`, `leave_balance:read_org`), but the controller's guard checks the base `leave_request:read`/`leave_balance:read` before the service's own org-scope logic ever runs. Fixed in `packages/shared/src/permissions.ts` (HR now also gets the base permissions) and re-synced. Full role matrix (ADMIN/HR/SUPERVISOR/EMPLOYEE/FINANCE) verified live — see `docs/FINAL-RELEASE-REPORT.md` §1.

BullMQ/Redis verified end-to-end this pass (local Redis was v3.0.504, incompatible with BullMQ's ≥5.0.0 requirement — this, not a code defect, explains why async workflows couldn't be verified in prior sessions). Swapped in a modern local Redis 7.4.9; AI job and report-export job both completed their full lifecycle with real data, no retries/duplicates. See `docs/FINAL-RELEASE-REPORT.md` §2.

**New Critical bug found and fixed as a direct result of finally being able to exercise the pipeline:** `POST /reports/generate` was completely broken for every user (`GenerateReportDto` had no `class-validator` decorators, silently rejected by the global `forbidNonWhitelisted` ValidationPipe). Fixed in `apps/api/src/modules/reports/reports.controller.ts`.

Also fixed this pass: attachments upload endpoints now have the same 10MB Multer file-size limit as time-tracking; `env.validation.ts` now rejects placeholder JWT secrets in production.

## Still unverified (not blocking, but not cleared either)

The dedicated security-focused pass (broader IDOR sweep beyond the leave-module spot-check
already done, CSP/header deep review, dependency audit) was cut off mid-review by an API rate
limit in an earlier session and still hasn't been fully completed. Don't treat that domain as
fully clean — it needs a follow-up pass before a real production launch. See
`docs/FINAL-RELEASE-REPORT.md` for what specifically was and wasn't covered this pass.

## Also flagged (Low priority, no urgency)

- Dead `refreshSecret` config value (never used — refresh tokens are opaque random bytes, not JWT-signed)
- `PayrollLineItem` missing a `version` field for optimistic locking
- Duplicated payroll-processing and AI-dashboard components (HR/Finance/Supervisor each 450–860 lines) — maintainability risk, not a bug
- `AdminOnly.tsx` duplicates `PermissionGuard`'s logic with a hardcoded check — redundant
- Minor accessibility gaps (modal dismiss without keyboard handling)
