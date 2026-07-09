# Backend-Only Features — Missing Frontend Pages

> **Purpose:** This file documents every backend API endpoint that has **zero frontend consumption**.
> An agent can pick any section below and build the missing UI without needing to re-audit the
> codebase. Endpoints are grouped by domain and prioritised.

**Generated:** 2026-07-08 | **Method:** Every NestJS controller read + every frontend API service
checked for caller references.
**Updated:** 2026-07-08 — re-checked against `Project Brief - TimeForge.pdf` (client-provided spec).
Added Tier 0 below: the single biggest brief-vs-implementation gap found.

---

## Contents

1. [How to use this file](#how-to-use-this-file)
2. [Priority table](#priority-table)
3. [Tier 1 — Complete module orphans (HIGH)](#tier-1--complete-module-orphans-high)
4. [Tier 2 — Admin CRUD pages (HIGH)](#tier-2--admin-crud-pages-high)
5. [Tier 3 — Settings / management pages (MEDIUM)](#tier-3--settings--management-pages-medium)
6. [Tier 4 — Orphaned read endpoints (LOW)](#tier-4--orphaned-read-endpoints-low)
7. [Duplicate-path endpoints (no action needed)](#duplicate-path-endpoints-no-action-needed)

---

## How to use this file

1. Pick a section from the priority table.
2. Read the endpoint table — it lists every route, method, permission required, and the backend
   source file.
3. Build the frontend page/component consuming those endpoints.
4. Add a nav entry in `apps/api/src/modules/navigation/navigation.service.ts` (`MENU_CATALOG`) if
   the page needs sidebar access.
5. Mark the section as done by changing its status.

---

## Priority table

| Priority | Domain | Missing page type | Backend endpoints | Est. effort |
|----------|--------|-------------------|-------------------|-------------|
| **CRITICAL** | **AI self-service triggers** | "Generate my summary" buttons for employees | 6 of 7 AI features | 1 day |
| **HIGH** | **Teams** | Full CRUD management page | 5 endpoints | 1 day |
| **HIGH** | **Roles / RBAC** | Full CRUD management page | 5 endpoints | 1 day |
| **HIGH** | **KPI Templates** | Admin management page | 5 endpoints | 0.5 day |
| **HIGH** | **Admin dashboard** | System overview + metrics page | 7 endpoints | 1 day |
| **MEDIUM** | **Clients** | Admin management page | 3 endpoints (CUD) | 0.5 day |
| **MEDIUM** | **Work Categories** | Admin management page | 3 endpoints (CUD) | 0.5 day |
| **MEDIUM** | **Organization** | Org profile + settings page | 4 endpoints | 0.5 day |
| **MEDIUM** | **Holidays** | Admin management page | 3 endpoints | 0.5 day |
| **MEDIUM** | **Payroll rates** | Employee rate editor UI | 1 endpoint | 0.5 day |
| **MEDIUM** | **Users** | Deactivation + role assignment UI | 2 endpoints | 0.5 day |
| **LOW** | **Dashboard widgets** | Progress / pending-approvals / etc. | 5 endpoints | 0.5 day |
| **LOW** | **Standalone reports** | Timesheet / payroll / KPI / etc. | 4 endpoints | 1 day |
| **LOW** | **Misc orphaned** | Approval remarks / scrum detail / etc. | 6 endpoints | 0.5 day |

---

## Tier 0 — AI self-service triggers (CRITICAL, brief-mandated)

### 0. Employee/self-service AI generation buttons

**Status:** ❌ Not started — this is the biggest gap between the client brief and the app.
**Backend module:** `apps/api/src/modules/ai/ai.]controller.ts` (`POST /ai/jobs`), feature prompts in
`apps/worker/src/ai/feature-handlers.ts`, DTO in `apps/api/src/modules/ai/dto.ts`.

The Project Brief (§7, "Planned AI capabilities") and §8 ("Expected Deliverables" → "AI Integration",
"AI-generated work summaries") name 7 AI features. All 7 have **real, working backend handlers**
(verified: each builds a genuine prompt from live DB data and runs through OpenAI, not a stub) and
are individually toggleable in `/admin/ai-config`. But only **1 of 7** has an actual UI button a user
can click:

| Feature key | Brief capability | Who holds the permission | Frontend trigger? |
|---|---|---|---|
| `DAILY_SUMMARY` | "Automatic daily work summaries" | EMPLOYEE, SUPERVISOR (`ai:trigger_self`) | ❌ None |
| `WEEKLY_SUMMARY` | "Weekly productivity reports" | EMPLOYEE, SUPERVISOR (`ai:trigger_self`) | ❌ None |
| `TIMESHEET_SUMMARY` | AI-assisted timesheet review | EMPLOYEE, SUPERVISOR (`ai:trigger_self`) | ❌ None |
| `BLOCKER_DETECTION` | "Identification of recurring blockers" | EMPLOYEE, SUPERVISOR (`ai:trigger_self`) | ❌ None |
| `PRODUCTIVITY_INSIGHT` | "Productivity trend analysis" | SUPERVISOR (`ai:trigger_team`) | ❌ None |
| `KPI_ANALYSIS` | "KPI performance analysis" | SUPERVISOR (`ai:trigger_team`) | ❌ None |
| `SUPERVISOR_ADVISORY` | "Supervisor recommendations" | SUPERVISOR (`ai:trigger_team`) | ✅ `/supervisor/ai-insights` (added 2026-07-08) |
| `PAYROLL_VALIDATION` | "Payroll validation" | FINANCE/ADMIN (org scope) | ❌ None |

The scrum-management module's `AiInsightCard` component (`apps/web/features/scrum-management/components/AiInsightCard.tsx`)
and its service (`apps/web/features/scrum-management/api/ai-insight.service.ts`) already implement the
full trigger → poll job → poll result pattern against `POST /ai/jobs`, `GET /ai/jobs/:id`,
`GET /ai/results/:id` — generically, for any feature key. It is hardcoded to `SUPERVISOR_ADVISORY`
only. The fastest fix is **not** building 6 new components: generalize `AiInsightCard` to accept a
`feature` prop and a `subjectType`/`subjectId`, then place instances of it wherever employees already
see their own timesheets/scrum entries (e.g. Timesheets page, Daily Scrum personal view) and wherever
Finance sees a payroll period (for `PAYROLL_VALIDATION`).

**Frontend pieces needed:**
- Generalize `AiInsightCard` to take `feature: AiFeatureKey` instead of being hardcoded.
- Employee-facing: a "Generate my daily/weekly summary" card on the personal Daily Scrum / Timesheets
  pages (`DAILY_SUMMARY`, `WEEKLY_SUMMARY`, `TIMESHEET_SUMMARY`, `BLOCKER_DETECTION` — subject = self).
- Supervisor-facing: `PRODUCTIVITY_INSIGHT` and `KPI_ANALYSIS` cards on the KPI Dashboard page
  (subject = team, already have `AI_TRIGGER_TEAM`).
- Finance-facing: `PAYROLL_VALIDATION` trigger on the Finance Payroll Processing page (subject =
  payroll period) — this pairs naturally with the validate/approve/reject/send-to-bank pipeline
  already built there.
- Respect the existing `/admin/ai-config` toggles — `AiService.checkFeatureEnabled()` already 403s if
  an admin disabled a feature, so the UI should hide/disable the button accordingly (check
  `GET /admin/ai-config` response client-side, matching how `AiConfigContent.tsx` reads it).

---

## Tier 1 — Complete module orphans (HIGH)

### 1. Teams management page

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/teams/teams.controller.ts`
**Permissions used:** `team:read`, `team:create`, `team:update`, `team:delete`
**Prisma model:** `Team` (fields: id, name, description, departmentId, teamLeadId, etc.)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/teams` | `team:read` | Cursor-paginated list, supports query filters |
| GET | `/teams/:id` | `team:read` | Single team detail |
| POST | `/teams` | `team:create` | Create team |
| PATCH | `/teams/:id` | `team:update` | Update team |
| DELETE | `/teams/:id` | `team:delete` | Soft-delete, requires `version` for optimistic locking |

**Frontend pieces needed:** List page, create/edit form, delete confirmation. Admin sidebar nav entry.

---

### 2. Roles / RBAC management page

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/rbac/roles.controller.ts`
**Prisma model:** `Role` (fields: id, name, description, isSystem, permissions[], etc.)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/roles` | `role:read` | Cursor-paginated list |
| GET | `/roles/matrix` | `role:read` | **Already consumed** — permission matrix for employee editor |
| GET | `/roles/:id` | `role:read` | Single role detail |
| POST | `/roles` | `role:create` | Create custom role with permission set |
| PATCH | `/roles/:id` | `role:update` | Rename or replace permission set |
| DELETE | `/roles/:id` | `role:delete` | Soft-delete, system roles return 409 |

**Frontend pieces needed:** Role list, create/edit form (with permission checkboxes), delete with
system-role protection. Admin sidebar nav entry. The `GET /permissions` endpoint in
`apps/api/src/modules/rbac/permissions.controller.ts` returns the full permission catalog for the
checkboxes.

---

### 3. Admin KPI Template management page

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/kpi/kpi.controller.ts`
**Prisma model:** `KpiTemplate` (fields: name, description, metricType, period, targetValue, appliesTo)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/kpi/templates` | `kpi_template:read` | Cursor-paginated, searchable by `q` |
| GET | `/kpi/templates/:id` | `kpi_template:read` | Single template |
| POST | `/kpi/templates` | `kpi_template:create` | Create template |
| PATCH | `/kpi/templates/:id` | `kpi_template:update` | Update, requires `version` for optimistic locking |
| DELETE | `/kpi/templates/:id` | `kpi_template:delete` | Soft-delete, requires `version` |

**Also NOT consumed by FE:** `GET /kpi/templates` list is never fetched — the supervisor
kpi-dashboard page and employee reports page use `/kpi/progress` directly but they don't read the
template catalog.

**Frontend pieces needed:** Admin list page, create/edit form (name, description, metricType enum
COUNT/HOURS/PERCENT/CURRENCY, period enum DAILY/WEEKLY/MONTHLY/PAYROLL_PERIOD, targetValue,
appliesTo JSON for role/department targeting), delete with confirmation.

---

### 4. Admin dashboard — System overview & metrics

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/admin/admin.controller.ts`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/admin/overview` | `org:read` | Tenant snapshot: user counts, timesheet status, pending approvals, roles, KPI templates |
| GET | `/admin/user-overview` | `user:read` | User breakdown by status/employment type, recent joiners, pending invites |
| GET | `/admin/org-overview` | `org:read` | Organization details, module entity counts (depts, teams, clients, projects) |
| GET | `/admin/system-metrics` | `org:read` | Cross-module aggregate counts, AI usage, notifications, process stats |
| GET | `/admin/health` | `org:read` | Service health: DB latency, process uptime |
| GET | `/admin/config` | `org:read` | Read all organization settings |
| PATCH | `/admin/config/:key` | `org:update` | Upsert an org setting by key |
| GET | `/admin/feature-flags` | `org:read` | Feature flags from org_settings (keys prefixed `feature.*`) |

**Frontend pieces needed:** Admin system overview dashboard page (separate from the main admin
dashboard already at `/admin`). Shows real-time metrics, health, config, feature flags.

---

## Tier 2 — Admin CRUD pages (HIGH)

### 5. Client management page

**Status:** ❌ Not started (read-only picker exists in `catalog.service.ts`)
**Backend module:** `apps/api/src/modules/clients/clients.controller.ts`
**Prisma model:** `Client`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/clients` | `client:read` | **Already consumed** (picker) |
| GET | `/clients/:id` | `client:read` | Single client detail |
| POST | `/clients` | `client:create` | Create client |
| PATCH | `/clients/:id` | `client:update` | Update client |
| DELETE | `/clients/:id` | `client:delete` | Soft-delete, requires `version` |

**Frontend pieces needed:** Admin list page, create/edit form, delete. Can reuse patterns from
`admin/departments/` (which already has full CRUD).

---

### 6. Work Category management page

**Status:** ❌ Not started (read-only picker exists in `catalog.service.ts`)
**Backend module:** `apps/api/src/modules/work-categories/work-categories.controller.ts`
**Prisma model:** `WorkCategory`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/work-categories` | `work_category:read` | **Already consumed** (picker) |
| GET | `/work-categories/:id` | `work_category:read` | Single detail |
| POST | `/work-categories` | `work_category:create` | Create |
| PATCH | `/work-categories/:id` | `work_category:update` | Update |
| DELETE | `/work-categories/:id` | `work_category:delete` | Soft-delete, requires `version` |

---

### 7. Hourly rate editor (Payroll)

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/payroll/payroll.controller.ts` (lines 152–161)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/payroll/rates/:userId` | `payroll_rate:read` | Get employee's current rate |
| PATCH | `/payroll/rates/:userId` | `payroll_rate:update` | Update rate (query params: `rate`, `version`) |

**Frontend pieces needed:** A way to view/edit an employee's hourly rate from the employee detail
page or a dedicated payroll rates page.

---

### 8. User deactivation & role assignment

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/users/users.controller.ts` (lines 100–111)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| POST | `/users/:id/deactivate` | `user:deactivate` | Deactivate user account |
| POST | `/users/:id/roles` | `user:assign_role` | Assign roles to user (body: `AssignRolesDto`) |

**Frontend pieces needed:** Deactivate button on employee detail/edit page, role multi-select
picker on employee form.

---

## Tier 3 — Settings / management pages (MEDIUM)

### 9. Organization profile & settings page

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/organization/organization.controller.ts`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/organization` | `org:read` | Org profile |
| PATCH | `/organization` | `org:update` | Update org profile (name, logo, etc.) |
| GET | `/organization/settings` | `org_settings:read` | All org settings |
| PUT | `/organization/settings/:key` | `org_settings:update` | Upsert setting by key |

**Frontend pieces needed:** Organization settings page under admin, with profile editing and
key-value settings management.

---

### 10. Holidays management page

**Status:** ❌ Not started
**Backend module:** `apps/api/src/modules/organization/organization.controller.ts` (lines 83–104)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/organization/holidays` | `holiday:read` | List holidays |
| POST | `/organization/holidays` | `holiday:write` | Create holiday |
| DELETE | `/organization/holidays/:id` | `holiday:write` | Delete holiday, requires `version` |

**Frontend pieces needed:** Holiday list/calendar with create/delete.

---

## Tier 4 — Orphaned read endpoints (LOW)

### 11. Dashboard widgets (not wired to any dashboard)

**Backend module:** `apps/api/src/modules/dashboard-reports/dashboard.controller.ts`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/dashboard/progress` | `dashboard:read_self` | Today's hours, weekly hours, break time, completed tasks, productivity, KPI progress |
| GET | `/dashboard/pending-approvals` | `approval:decide` | Pending timesheets awaiting approval |
| GET | `/dashboard/attendance` | `attendance:read_org` | Org attendance trends by ISO week |
| GET | `/dashboard/payroll-status` | `payroll:read` | Payroll period status overview |
| GET | `/dashboard/team-summary` | `dashboard:read_team` | Team member hours and KPI snapshot |

These are all **GET endpoints that return pre-computed dashboard data** but no frontend page calls
them. They could be wired into the main `/dashboard` page.

---

### 12. Standalone report endpoints (not wired)

**Backend module:** `apps/api/src/modules/dashboard-reports/reports.controller.ts`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/reports/timesheets` | `timesheet:read_org` | Paginated timesheet report with aggregated totals |
| GET | `/reports/payroll` | `payroll:read` | Payroll period report |
| GET | `/reports/kpi` | `kpi:read_org` | KPI progress report |
| GET | `/reports/productivity` | `dashboard:read_team` | Hours by user and project |

These report endpoints are separate from the ones covered in `apps/api/src/modules/reports/` —
they live in the `dashboard-reports` module.

---

### 13. Approval remarks endpoint

**Backend module:** `apps/api/src/modules/approvals/approvals.controller.ts`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| POST | `/approvals/:timesheetId/remarks` | `approval:decide` | Submit remark on an approval |

The FE currently has coaching remarks (`POST /kpi/coaching`) but not the generic approval remarks.

---

### 14. Miscellaneous orphaned endpoints

| Method | Route | Module | Notes |
|--------|-------|--------|-------|
| GET | `/audit-logs/:id` | Audit | Single audit log detail |
| GET | `/scrum-entries/:id` | Scrum | Single scrum entry |
| GET | `/scrum/:id` | Scrum | Scrum management detail |
| GET | `/ai/jobs` | AI | List AI jobs with filters |
| POST | `/auth/verify-email` | Auth | Email verification (likely triggered from email link) |
| GET | `/auth/me` | Auth | Current user profile (FE uses `/users/me`) |

---

## Duplicate-path endpoints (no action needed)

These are **alternative backend routes** for functionality the FE already accesses via a different
path. They don't need frontend work.

| Unused route | FE uses instead | Notes |
|---|---|---|
| `POST /admin/users/import` | `/employees/import` | Admin bulk import |
| `POST /admin/users/:id/approve` | `/approvals/accounts/:id/approve` | Approve pending employee |
| `POST /admin/users/:id/reject` | `/approvals/accounts/:id/reject` | Reject pending employee |
| `POST /admin/approvals/bulk` | `/timesheets/bulk-approve` | Bulk approve timesheets |
| `GET /users` | `/employees` | User list |
| `GET /users/:id` | `/employees/:id` | User detail |
| `PATCH /users/:id` | `/employees/:id` | Update user |

---

## Key conventions (for any agent building these pages)

- **Stack:** Next.js 16 App Router, Tailwind, React Query, Lucide icons
- **API calls:** Create a service file under `apps/web/features/<domain>/api/<name>.service.ts`
  using the existing `apiClient` from `@/lib/api/client`
- **RBAC:** Use the existing permission constants from
  `packages/shared/src/permissions.ts` — don't invent new ones
- **Sidebar nav:** Add entry to `MENU_CATALOG` in
  `apps/api/src/modules/navigation/navigation.service.ts`
- **Admin layout:** Dashboard-like pages/forms go under `apps/web/app/admin/<name>/`
- **Multi-tenant:** Every API call already scopes by `tenantId` server-side — just include the
  org context in the request
- **Audit + notify:** Mutating actions should write `AuditLog` entries — match patterns in
  `PayrollService` or `ScrumService`
- **Optimistic locking:** DELETE and PATCH endpoints often require a `version` query param —
  always pass it from the UI
