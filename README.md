# TimeForge — AI-Powered Workforce Performance, Timesheet & Daily Scrum Management System

Multi-tenant workforce platform: time tracking, smart timesheets, daily scrum, KPI tracking, supervisor
approvals, payroll, dashboards/reports, and async AI insights — full stack (API + worker + web app).

**Stack:** NestJS 10 · Next.js 16 (App Router) · TypeScript · PostgreSQL via Supabase (Prisma ORM) ·
Supabase Storage · Redis + BullMQ · JWT (rotating refresh) · Argon2 · OpenAI (async) · Tailwind · React Query

> Supabase is used as managed Postgres + object storage only — **not** Supabase Auth. Auth is custom JWT/RBAC.

---

## Quickstart

```bash
cp .env.example .env
# Fill in DATABASE_URL, DIRECT_URL, REDIS_URL, JWT secrets

npm install
npx prisma generate
npx prisma migrate deploy       # or: npx prisma db push (dev only)
npm run db:seed
npm run start:api               # http://localhost:3000/api/v1
npm run start:worker            # separate terminal — BullMQ jobs (AI, exports, notifications)
npm --prefix apps/web run dev   # separate terminal — http://localhost:3001
```

Swagger UI: `http://localhost:3000/api/docs` · Swagger JSON: `http://localhost:3000/api/docs-json`

`apps/web/.env.local` needs `NEXT_PUBLIC_API_URL=http://localhost:3000`.

### Docker (full stack)

```bash
cp .env.example .env
docker compose up --build
```

---

## Seeded demo accounts (password: `ChangeMe123!`)

| Email | Role | Employment | Payroll |
|---|---|---|---|
| admin@demo.test | ADMIN | FULL_TIME | ✓ |
| supervisor@demo.test | SUPERVISOR | FULL_TIME | ✓ |
| hr@demo.test | HR | FULL_TIME | ✓ |
| finance@demo.test | FINANCE | FULL_TIME | ✓ |
| employee@demo.test | EMPLOYEE | EMPLOYEE | ✓ |
| intern@demo.test | EMPLOYEE | INTERN | ✗ |

Note: the brief's "HR and Finance" is implemented as **two separate roles** (`HR`, `FINANCE`) with distinct
permission sets, not one combined role. Flag to the client if this deviation isn't desired.

---

## Project brief alignment (audited 2026-07-07)

Source: `Project Brief - TimeForge.pdf` (StartupLab). Legend: ✅ complete · ⚠️ partial · ❌ missing.

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | Time Tracking | ⚠️ | Date/Start/End/Duration/Project/Client/Work Category/Reference Links exist. Attachments now support real file upload (POST/DELETE `/time-entries/:id/attachments` via `UploadService`). Task is a real DB column (`TimeEntry.task`) stored separately from description. **Department is now an editable per-entry field** (defaults to profile department, can override per entry). **Still missing:** a dedicated Deliverables field. |
| 2 | Smart Timesheets | ✅ | `Timesheet.summary`, project linkage, and KPI progress auto-updates on approval (`approvals.service.ts` → `kpiService.upsertProgressFromApproval`) all wired. |
| 3 | Daily Scrum | ⚠️ | Yesterday/Today/Blockers/Notes all captured; supervisor comments persist. "Recurring operational issues" is only a manual one-off flag (`scrum.service.ts:flagScrumEntry`), not automatic pattern detection — the AI `BLOCKER_DETECTION` feature covers this via LLM analysis instead of a rules engine. |
| 4 | KPI Management | ⚠️ | Templates support free-text names + role/department targeting. `metricType` is a fixed 4-value enum (COUNT/HOURS/PERCENT/CURRENCY), not fully open-ended. Progress auto-updates from approved work logs. |
| 5 | Supervisor Approval Workflow | ✅ | Full state machine incl. Request Revision, permanent remarks, no-self-approval, real persisted notifications (not toasts). |
| 6 | Payroll Preparation | ✅ | FIRST_HALF/SECOND_HALF/CUSTOM periods, all required summary fields, real PDF **and** Excel export (`payroll-export.processor.ts`). |
| 7 | Dashboards/Analytics | ✅ | All 10 brief metrics exist somewhere, spread across role-specific dashboards (Admin/HR/Supervisor/Finance/Reports). Supervisor AI Insights dashboard added at `/supervisor/ai-insights` — 8 algorithmic endpoints (dashboard, leaderboard, insights, recommendations, team-health, trends, alerts, export) with real DB stats, no mock data, BullMQ export queue, Redis caching, team-scoped RBAC (`ai:trigger_team`). |
| 8 | AI Integration | ✅ | All 7 brief capabilities have real handlers in `apps/worker/src/ai/feature-handlers.ts`, not stubs. |
| 9 | Administrative Portal | ✅ | Users/departments/projects/KPIs/settings all manageable. AI configuration screen available at `/admin/ai-config` with per-feature toggles, provider status display, and runtime enforcement in `AiService.triggerJob()`. **Department detail page** at `/admin/departments/[id]` with assigned supervisor, employee/intern counts by employment type, active status toggle, and employee list. **Approval modal** on pending account approvals lets admins set department, employment type, and role before activating. **Employee profile** editable by admins (department, supervisor, employment type) in `ProfileAccountModal`. |
| 10 | Auth & Roles | ✅ | Employee/Intern, Supervisor, Admin map cleanly. HR/Finance split into two roles (see note above). Role assignment now possible during account approval via the approval modal. |

### Suggested priority order for remaining gaps
1. ✅ **Time entry attachments** — real file upload implemented (POST/DELETE `/time-entries/:id/attachments`, `UploadService`, frontend UI in `WorkDetailsCard.tsx`)
2. ✅ **AI configuration admin screen** — `/admin/ai-config` with per-feature toggles, provider status, runtime enforcement in `AiService.triggerJob()`
3. ✅ **Task as a real field** — `TimeEntry.task` column, backend DTOs/service updated, frontend form sends `task` separately instead of composing into `description`
4. ✅ **Department on time entries** — optional `TimeEntry.departmentId` FK; form defaults to profile department with editable dropdown; aggregation in `organization.service.ts` prefers entry-level department
5. ✅ **Recurring-blocker detection** — rules-based flag when an employee reports blockers on 3+ of their last 5 scrum entries, surfaced in `TeamScrumSubmissionsContent.tsx` as a badge. KPI metric types investigated: existing `COUNT`/`HOURS`/`PERCENT`/`CURRENCY` enum already covers all brief examples — no change needed.
6. ✅ **Approval modal** — admin can set department, employment type, and role when approving pending registrations. Backend `ApproveUserDto` extended; approval modal with selectors added to `AccountApprovalsContent.tsx`.
7. ✅ **Department detail page** — `/admin/departments/[id]` with assigned supervisor, employee/intern/other counts, active status toggle, and employee list table.
8. ✅ **Employee profile editability** — admins can edit department, supervisor, and employment type in `ProfileAccountModal`. `ProfessionalDetailsCard` now renders editable Selects in admin mode.
9. ✅ **Department isActive field** — Prisma schema + migration adds `isActive` boolean to Department model, surfaced in department detail page and directory table.

---

## Production hardening

| Area | Status | Details |
|------|--------|---------|
| **Rate limiting** | ✅ | `@nestjs/throttler` (120 req / 60s) global. `POST /login` & `/refresh` throttled to 10/min. Forgot-password: 3/min. Reset-password/verify-email: 5/min. Register: 5/hour. |
| **Exception handling** | ✅ | `AllExceptionsFilter` — returns `{ success, error, code }` JSON, never leaks stack traces |
| **RLS (Row-Level Security)** | ✅ | `scripts/apply-rls.js` — run `npm run db:rls` after each deploy |
| **Migrations** | ✅ | 15 migrations. Latest (`20260708000000_production_hardening`) adds `PENDING` enum, `reference_links` column, token fields on users, composite indexes. Written manually (shadow-DB issue against Supabase). |
| **Tests** | ✅ | `jest.config.ts` + 7 unit tests covering AI feature-toggling + admin config |
| **Secrets & Env** | ✅ | `env.validation.ts` validates `CORS_ORIGINS` required, `COOKIE_SECURE` production-only, `REDIS_URL` no-localhost in production. `configuration.ts` removes all `?? ''` fallbacks for sensitive keys. |
| **CORS hardening** | ✅ | `main.ts` no longer falls back to `origin: true`. Logs warning & disables CORS if `CORS_ORIGINS` is empty. |
| **Password reset** | ✅ | `POST /auth/forgot-password` + `POST /auth/reset-password` — SHA-256 hashed tokens, 1h expiry, Argon2 re-hash, lockout reset, audit log. Always returns 202 (user enumeration prevention). |
| **Email verification** | ✅ | `POST /auth/verify-email` — 48h token, sent automatically on register (no auto-verify), audit logged. Unverified accounts blocked at login. |
| **Reports export** | ✅ | `reports-export.processor.ts` rewritten with real Prisma queries (users, timesheets, payroll, scrum, departments) instead of hardcoded values. Supports CSV/XLSX/PDF via StorageService. |
| **Notifications** | ✅ | `notifications.processor.ts` delivers EMAIL-channel notifications via MailerService. `NotificationsService.create()` queues email delivery to BullMQ (3 retries, exponential backoff). |
| **Finance analytics** | ✅ | `finance-analytics.processor.ts` generates dashboard exports with real payroll, timesheet, and organizational data. Audit-logged with `FINANCE_DASHBOARD_EXPORT` action. |
| **Frontend hardening** | ✅ | Root `loading.tsx`/`error.tsx` added. Admin-level `loading.tsx`. `FinanceSidebar.tsx` fetches real org from `/navigation/sidebar` instead of `MOCK_ORG`. |
| **Database** | ✅ | Schema hardened with token fields, email/password-reset columns, composite indexes on security_logs/security_alerts/generated_reports/payroll_reports/payroll_line_items. |
| **Security audit** | ✅ | Findings fixed: rate limiting on login/refresh, payroll audit logs (createPeriod, lockPeriod, updateRate). Scrum dashboard POST endpoints intentionally use service-level OR-permission check. |

---

## What's implemented

### Core Platform
- **Auth** — JWT access + rotating refresh tokens, Argon2 passwords
- **RBAC** — Permission-based roles (`ADMIN`, `HR`, `FINANCE`, `SUPERVISOR`, `EMPLOYEE`), `@RequirePermissions` guard, permission-driven sidebar navigation (`apps/api/src/modules/navigation`)
- **Users** — CRUD, status lifecycle, employment type, approvals for new registrations
- **Organization** — Settings, fiscal config, holidays
- **Departments / Teams / Clients / Projects / Work Categories**

### Workforce
- **Time Tracking** — Clock in/out, time entries (see gaps above)
- **Smart Timesheets** — Periods, submission workflow, KPI-linked approval
- **Daily Scrum** — Standup entries (yesterday/today/blockers/notes), supervisor coaching comments, Team Scrum Submissions review page
- **Team Schedules** — Shift creation wizard, conflict/overlap detection, weekly calendar
- **Approvals** — Supervisor approval flow, no-self-approval rule, revision requests
- **KPI** — Templates, progress tracking, Team KPI Dashboard with coaching workflow
- **Payroll** — Periods, line items, rate management, multi-format export (PDF/XLSX/CSV via BullMQ), HR-facing Payroll Processing wizard
- **Attendance Reports** — Derived from real timesheet/shift/holiday data (no dedicated Attendance model)

### Enterprise
- **Notifications** — In-app, realtime, count, mark read
- **Audit Logs** — Append-only, role-scoped access, every payroll/HR action logged
- **Dashboards** — Role-specific: Admin (System Overview), HR (executive AI summary + department analytics), Supervisor, Finance, plus Reports (Timesheet/Payroll/KPI/Productivity/Attendance)
- **Admin** — Bulk import, bulk approve, system metrics, health, org config

### AI (Async, BullMQ-backed)
- Jobs never block API requests. OpenAI provider with stub fallback when key absent.
- **Features:** Daily Summary, Weekly Summary, Timesheet Summary, Blocker Detection, KPI Analysis, Productivity Insight, Supervisor Advisory, Payroll Validation
- **Audit** — SHA-256 hashes of prompt + response stored; raw content never persisted

### Frontend (apps/web)
- Next.js 16 App Router, role-aware routing (`DashboardRouter`, `TimeTrackingRouter`, `TimesheetsRouter` switch content by role client-side)
- A **separate Finance shell** (`apps/finance/*` routes + `FinanceAppShell`/`FinanceSidebar`) exists alongside the main app shell (`AppShell`/`AdminSidebar`) — see gotcha below
- Currency is formatted in **PHP (₱)**, not USD, across every dashboard/report/export

---

## Project structure

```
timeforge/
├── apps/
│   ├── api/                    # NestJS HTTP API (port 3000)
│   │   └── src/
│   │       ├── common/         # guards, decorators, filters, prisma, context
│   │       ├── config/         # typed config + env validation
│   │       └── modules/        # one folder per feature module
│   ├── worker/                 # BullMQ consumer (AI, exports, notifications queues)
│   │   └── src/
│   │       ├── ai/             # OpenAI provider + feature handlers
│   │       └── processors/     # export processors (payroll, reports, performance, org)
│   └── web/                    # Next.js 16 app (port 3001)
│       └── app/, features/, components/
├── packages/shared/            # shared enums + permission catalog
├── prisma/                     # schema.prisma, migrations/, seed.ts
├── docs/                       # frozen API + DB contracts, release checklist, design system
└── docker-compose.yml
```

---

## Architecture

### Tenant isolation (4 layers)
1. **JWT** — `tenantId` in every access token
2. **AsyncLocalStorage** — `RequestContextMiddleware` propagates tenantId per request
3. **Prisma middleware** — auto-injects `tenantId` on all reads/writes for tenant-scoped models
4. **Postgres RLS** — database-level backstop (`npm run db:rls` to enable)

### API conventions
- Base path: `/api/v1/`
- Auth: Bearer token (`Authorization: Bearer <token>`)
- Pagination: cursor-based (`cursor` + `limit`) on most lists; a few reporting endpoints (e.g. Attendance
  Report) use page-number pagination to match their table UI — check the controller before assuming cursor style
- Response envelope: `{ data, meta }` for lists; direct object for single resources
- Idempotency: `Idempotency-Key` header required on bulk, payroll-mutation, and AI trigger endpoints

### Permission model
```
role → role_permissions → permission (e.g. "timesheet:submit", "payroll:read")
user → user_roles → role
```
`@RequirePermissions('x', 'y')` requires ALL listed permissions (AND logic).
For OR logic: put minimum permission on route, check higher in service.

### Sidebar navigation
`apps/api/src/modules/navigation/navigation.service.ts` is the **single source of truth** for the main app
sidebar (`MENU_CATALOG` array). It's mostly permission-driven, but several items are deliberately
**role-scoped rather than permission-scoped** where two roles share a permission but should see different
things (e.g. `payroll` routes to different pages for HR vs Finance vs Admin despite all three holding
overlapping payroll permissions). Read the inline comments in that filter before adding a new item —
copy-pasting a plain permission check where a role check is needed is the most common bug here.

---

## Gotchas for future agents / contributors

- **CacheService (Redis) degrades gracefully.** `apps/api/src/infra/cache.service.ts` wraps every Redis
  call in a 300ms timeout + try/catch. If you see dashboard endpoints hang forever in dev, it's *not* this —
  it was hanging before the fix; if it hangs again, check `REDIS_URL` connectivity first, not the app code.
- **The Finance module is a parallel universe.** `apps/web/app/finance/**` renders inside `FinanceAppShell` +
  `FinanceSidebar` (hardcoded 4-item nav, not driven by `navigation.service.ts`). It does **not** share the
  main `AppShell`/`AdminSidebar`. If you add a Finance-role feature, decide deliberately whether it belongs
  in the Finance shell or the main shell — don't assume one implies the other.
- **`Select` components must never render with an `undefined` value on first paint.** Base UI's Select
  throws a "switching from uncontrolled to controlled" console error if a derived value starts as
  `undefined` and later resolves to a string (e.g. from an async query). Always fall back to `""`, and
  prefer syncing async data into real state via `useEffect` over computing a derived fallback inline.
- **The shared `Select` also has a known display bug**: it shows the raw `value` instead of the matching
  item's label in some cases. A follow-up task for this was flagged but not yet picked up — check before
  assuming it's fixed.
- **Currency is PHP (₱), not USD.** Every `formatCurrency` helper across the app was converted from `$` to
  `₱`. If you add a new one, match that convention — don't reintroduce `$`.
- **Payroll Processing has been rewritten more than once.** If `apps/web/features/payroll-processing/` looks
  different from what you expect, re-read it fresh rather than trusting prior session notes — it's evolved
  from a simple wizard to a DRAFT→VALIDATED→APPROVED→SENT_TO_BANK state machine.
- **`SectionCard`'s header stacks vertically on narrow containers** (`flex-col sm:flex-row`) specifically so
  a title + wide action slot (e.g. tabs) don't overlap in sidebar-width cards. Don't revert this to a single
  row without checking narrow-viewport usages first.

---

## Scripts

| Command | Description |
|---|---|
| `npm run start:api` | Start API in watch mode |
| `npm run start:worker` | Start worker in watch mode |
| `npm --prefix apps/web run dev` | Start Next.js dev server |
| `npm run build` | Build api + worker for production |
| `npx prisma migrate deploy` | Apply migrations (production) |
| `npx prisma db push` | Sync schema without migration record (dev) |
| `npm run db:seed` | Seed roles, permissions, demo users |
| `npm run db:rls` | Apply Postgres RLS policies |

---

## Environment variables

See `.env.example` for all required variables. Key ones:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Pooled connection (port 6543 for Supabase) |
| `DIRECT_URL` | ✅ | Direct connection (port 5432, for migrations) |
| `REDIS_URL` | ✅ | BullMQ + cache (see CacheService gotcha above) |
| `JWT_ACCESS_SECRET` | ✅ | Change in production |
| `JWT_REFRESH_SECRET` | ✅ | Change in production |
| `OPENAI_API_KEY` | ⬜ | Leave empty for stub/fallback mode |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ | Only needed for Supabase Storage |
| `NEXT_PUBLIC_API_URL` | ✅ (web) | In `apps/web/.env.local`, e.g. `http://localhost:3000` |

---

## Release checklist

See [`docs/RELEASE-CHECKLIST.md`](./docs/RELEASE-CHECKLIST.md).


