# TimeForge — Production Readiness Audit

> **Date:** 2026-07-08
> **Score:** 62%
> **Recommendation:** NO-GO — not ready for production.

---

## Critical Issues (Must fix before go-live)

| #  | Issue | File | Details |
|----|-------|------|---------|
| CR-1 | **Live credentials on disk in `.env`** | `.env` (gitignored, but present) | Contains live Supabase DB password, OpenRouter API key (`sk-or-v1-...`), Supabase service role JWT, Gmail SMTP app password **and** JWT secrets still set to `change-me-access-secret`/`change-me-refresh-secret` (identical to `.env.example`). Rotate all immediately. |
| CR-2 | **CORS fallback allows all origins** | `apps/api/src/main.ts:35` | `origin: origins.length ? origins : true` + `credentials: true`. If `CORS_ORIGINS` env var is unset or empty, the API allows **any origin** to make credentialed requests. `CORS_ORIGINS` is **not validated** in `env.validation.ts`. |
| CR-3 | **Reports export processor generates hardcoded fake data** | `apps/worker/src/processors/reports-export.processor.ts:41-72` | CSV/Excel/PDF exports fabricate values: `Uptime: 99.98%`, `Active Users: 1,240 / 1,500`, `Total Labor Cost: ₱4,822,150`, `System Compliance Score: 98.2`. Real data is never queried. |

---

## High Priority Issues (Must fix before go-live)

| #  | Issue | File | Details |
|----|-------|------|---------|
| HI-1 | **JWT secrets are placeholder values in `.env.example`** | `.env.example:19-20` | `change-me-access-secret` / `change-me-refresh-secret`. If copied to production, anyone can forge JWTs. |
| HI-2 | **Hardcoded secrets in `docker-compose.yml`** | `docker-compose.yml:46-47` | `docker-access-secret` / `docker-refresh-secret` committed to repo. |
| HI-3 | **Hardcoded DB password in RLS SQL** | `prisma/sql/rls.sql:10` | `CREATE ROLE timeforge_app LOGIN PASSWORD 'app_password'` committed to repo. |
| HI-4 | **No global soft-delete filter** | `apps/api/src/common/prisma/prisma.service.ts` | Every query must manually add `deletedAt: null`. Inconsistent — 11 models (e.g. `WorkSession`, `PayrollLineItem`, `ScrumBlocker`) lack `deletedAt` entirely. |
| HI-5 | **Password reset & email verification throw NotImplementedException** | `apps/api/src/modules/auth/auth.service.ts:377-381` | Endpoints exist but users cannot recover accounts or verify email. |
| HI-6 | **No `loading.tsx` or `error.tsx` anywhere** | `apps/web/app/` | Zero route-level loading fallbacks or error boundaries. Page transitions have no automatic spinner; an uncaught render error crashes the full page. |
| HI-7 | **`FinanceAnalyticsProcessor` is a stub** | `apps/worker/src/processors/finance-analytics.processor.ts:35` | `// TODO: Generate actual export file`. Dashboard exports silently log only. |
| HI-8 | **`NotificationsProcessor` is an empty stub** | `apps/worker/src/processors/notifications.processor.ts:13-16` | No email/push dispatch. In-app notifications are created in DB but never delivered. |
| HI-9 | **`FinanceSidebar` has hardcoded nav with no permission filtering** | `apps/web/features/finance/components/FinanceSidebar.tsx:12-19` | 4-item hardcoded nav. `permission` field exists per item but `visible` is always `true`. Uses `MOCK_ORG` instead of real organization data. |

---

## Medium Priority Issues

| #  | Issue | File | Details |
|----|-------|------|---------|
| MI-1 | **Hardcoded role checks instead of permissions** | `reports.service.ts:49-50`, `performance.service.ts:31-33`, `finance-ai.service.ts:87-88`, `navigation.service.ts:86-126` | 24 instances across 7 files check `p.roles.includes('ADMIN')` etc. instead of `p.permissions.includes('*')`. Navigation service couples sidebar visibility to role names. |
| MI-2 | **`Prisma as any` type bypasses (73 occurrences)** | `admin.service.ts`, `ai.service.ts`, `payroll.service.ts`, `ai.processor.ts`, `finance-ai.processor.ts` | Heavy use of `(this.prisma as any).method(...)` to bypass Prisma's generated types. Hides type errors at compile time. |
| MI-3 | **No middleware.ts on frontend** | `apps/web/` missing `middleware.ts` | All route protection is client-side; flash-of-unprotected-content before React hydrates. |
| MI-4 | **Frontend `rbac.ts` duplicated & out of sync** | `apps/web/features/auth/rbac.ts` | 43+ permissions missing vs backend matrix (`schedule:*`, `approval:*`, `notification:*`, etc.). Only affects UI convenience checks — real security is on API. |
| MI-5 | **`ROUTE_PERMISSIONS['/admin/approvals']` maps to wrong permission** | `apps/web/features/auth/route-permissions.ts` | Maps to `'user:update'` instead of `'approval:decide'` or `'approval:read_team'`. |
| MI-6 | **`DashboardController.summary()` missing `@RequirePermissions`** | `apps/api/src/modules/dashboard-reports/dashboard.controller.ts:20-31` | Service-layer resolves scope (line 129), but breaks the controller decorator convention. |
| MI-7 | **ScrumDashboardController (9 endpoints) missing `@RequirePermissions`** | `apps/api/src/modules/scrum/scrum-dashboard.controller.ts:13-93` | Service-layer checks exist but bypass convention. Architectural limitation of AND-only guard logic. |
| MI-8 | **Audit logging gaps** | `teams.service.ts`, `clients.service.ts`, `time-tracking.service.ts`, `work-sessions.service.ts`, `work-categories.service.ts` | Create/update/delete operations on Teams, Clients, Time Entries, Work Sessions, Work Categories not audited. |
| MI-9 | **No CSP/HSTS Helmet headers** | `apps/api/src/main.ts:17` | `helmet()` used with defaults only — no `contentSecurityPolicy`, no `hsts`. |
| MI-10 | **Missing `organizationId` on several models** | `schema.prisma` — `AuditLog`, `RefreshToken`, `AiJob`, `AiResult`, `AiAudit`, `Role`, `IdempotencyKey` | These models have `tenantId` but no `organizationId`. Inconsistent with 20+ other models. |
| MI-11 | **Live schema drift: `PENDING` UserStatus & `reference_links` never migrated** | `schema.prisma:23,574` vs migrations | `PENDING` enum value and `TimeEntry.reference_links` column defined in schema but never added to PostgreSQL. Running `prisma migrate dev` creates new migrations immediately. |
| MI-12 | **`COOKIE_SECURE` defaults to `false`** | `configuration.ts:7` | Not validated in `env.validation.ts`. In production with HTTPS, should be `true`. |
| MI-13 | **Rate limit config is dead code** | `configuration.ts:17-20` vs `app.module.ts:67` | `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` env vars are read into config but `ThrottlerModule` uses hardcoded values `60_000`/`120` directly. |
| MI-14 | **Remaining hardcoded change strings in performance dashboard** | `performance.service.ts:213,230` | `'+2.4% vs last week'` and `'+4% vs last week'` are still hardcoded (not data-derived). |
| MI-15 | **`SupabaseEdgeFunction` has open CORS** | `supabase/functions/send-email/index.ts:10-12` | `"Access-Control-Allow-Origin": "*"`. Acceptable for edge function behind auth, but notable. |
| MI-16 | **No per-endpoint rate limiting on login/refresh** | `app.module.ts:67` only global 120/min | Password brute-force not throttled beyond global limit. Registration is throttled to 5/hr (good). |

---

## Low Priority Issues

| #  | Issue | File | Details |
|----|-------|------|---------|
| LO-1 | **`PayrollReport`/`PayrollLineItem` indexes lack `organizationId` prefix** | `schema.prisma:986,1012` | Org-scoped queries may be less efficient. |
| LO-2 | **`SecurityLog`/`SecurityAlert`/`GeneratedReport` indexes on `[organizationId]` without `tenantId`** | `schema.prisma:1237,1259,1298` | Cross-tenant lookup risk (mitigated by RLS). |
| LO-3 | **Session restoration code duplicated** | `AppShell.tsx:29-58` vs `FinanceAppShell.tsx:23-52` | 50-line block copy-pasted. |
| LO-4 | **`: any` / `as any` pervasive (97 total)** | 52 `:any` + 45 `as any` across source files | 28 `as any` in `apps/api/src/` alone. Type safety erosion. |
| LO-5 | **No skip-to-content link** | All frontend pages | Accessibility gap for keyboard/screen reader users. |
| LO-6 | **Charts lack accessible labels** | `FinanceDashboardContent.tsx` (Recharts SVGs) | Screen readers cannot interpret chart data. |
| LO-7 | **Query DTOs without runtime validation** | `audit-logs.controller.ts:26`, `users/dto.ts:63-192` | Interfaces used instead of class-validator classes. |
| LO-8 | **`TENANT_MODELS` middleware missing 19 models** | `prisma.service.ts:6-17` | Relies solely on PostgreSQL RLS for those models. Acceptable if RLS is always enforced. |
| LO-9 | **HR role permissions list has duplicates** | `packages/shared/src/permissions.ts:206-207` | `P.SCHEDULE_*` listed twice. Cosmetic — deduplicated at seed time. |
| LO-10 | **Remember Me stores email in localStorage** | `LoginForm.tsx:48-57` | 30-day TTL for convenience; email is PII in localStorage. |
| LO-11 | **`OrganizationExportProcessor` imports from `../../../api/src/`** | `worker/src/processors/organization-export.processor.ts` | Worker imports from API source. Works in monorepo but breaks if modules are separated. |
| LO-12 | **No `role="navigation"` on sidebar `<nav>` elements** | `AdminSidebar.tsx`, `FinanceSidebar.tsx` | Minor ARIA redundancy issue. |

---

## What's Good

- **Refresh token rotation with family-based reuse detection** — industry best practice (OAuth 2.0 BCP)
- **Global JWT + Permissions guards** registered in `app.module.ts` — defense in depth
- **~247/260 endpoints have `@RequirePermissions`** — 95% coverage
- **Permission catalog with 130 permissions** across 5 roles in `packages/shared/`
- **Tenant isolation** via Prisma middleware + PostgreSQL RLS policies on 31 tables
- **Comprehensive audit logging** — 58+ audit write locations across 19 modules
- **Cache service degrades gracefully** with 300ms timeout + try/catch
- **All 8 BullMQ queues have matching processors** — no orphan queues on API side
- **Input validation** with `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
- **`aria-label` coverage** on icon buttons is thorough throughout the frontend
- **Mobile drawer** with focus management, Escape-to-close, scroll lock
- **In-memory access token** (not localStorage/XSS-vulnerable storage)
- **Pino logger redacts headers** — `Authorization` and `Cookie` stripped from logs
- **All migrations linear, no broken chain** — 14 migrations applied cleanly

---

## Production Readiness Score

**62%**

| Category | Score | Key Blocker |
|----------|-------|-------------|
| Authentication | 85% | Stubbed password reset |
| Authorization/RBAC | 80% | Hardcoded role checks, 13 endpoints missing `@RequirePermissions` |
| Database/Prisma | 60% | Schema drift, missing soft-delete, 11 models lack `deletedAt` |
| Workers/Queues | 55% | Reports-export fabricates data, 2 stubs (finance-analytics, notifications) |
| Secrets/Security | 40% | Live credentials on disk, CORS fallback, weak JWT defaults |
| Frontend | 50% | No loading/error boundaries, no middleware, FinanceSidebar hardcoded |
| Audit/Compliance | 75% | 6 operations missing audit logging |
| Testing | — | Not evaluated |

---

## Go / No-Go

**NO-GO** — not ready for production.

### Gate criteria (all 3 CR-* must be resolved before re-evaluation)

1. Rotate all leaked credentials + set strong JWT secrets
2. Fix CORS fallback (`: true` → throw if `CORS_ORIGINS` is unset)
3. Replace hardcoded data in `ReportsExportProcessor` with real queries

### After gates cleared, address these before production

4. Implement password reset flow (or remove endpoints)
5. Add `loading.tsx` + `error.tsx` to `apps/web/app/`
6. Fix `NotificationsProcessor` stub or remove the queue
7. Fix `FinanceAnalyticsProcessor` stub or remove the queue
8. Fix `FinanceSidebar` to fetch nav from backend (like `AdminSidebar`)
9. Resolve Prisma schema drift (run `prisma migrate dev` to capture pending changes)
10. Add `CORS_ORIGINS` and `COOKIE_SECURE` to `env.validation.ts`
11. Add `organizationId` to `AuditLog` model
12. Add audit logging to Teams, Clients, Time Tracking services
