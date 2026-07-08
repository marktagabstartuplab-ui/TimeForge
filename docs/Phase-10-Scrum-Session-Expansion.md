# TimeForge — Phase 10: Daily Scrum Task/Blocker & Session Tracking Expansion

> Addendum to Phase 3 (Database Design) and Phase 4 (API Specification). Documents the additive
> schema/API expansion that replaced the JSON-in-text-column Scrum hack and the client-side break
> simulation with real relational tables and server-computed state.
> Migration: `prisma/migrations/20260704060000_scrum_tasks_blockers_sessions_attachments/`

---

## Why

The frontend had grown ahead of the backend:
- Daily Scrum tasks/blockers were JSON-encoded into `scrum_entries.today` / `.blockers` (plain text columns), with completion % computed client-side.
- Breaks were simulated entirely in the browser (`localStorage` + stop/start `TimeEntry` pairs) — no break count/duration was ever persisted server-side, and there was no activity timeline.
- Employee registration → approval had no admin notification, no `REJECTED` status, and `NotificationsService` was read-only.
- There was no attachments model, no timesheet-history-by-range/CSV export, and RLS covered only 7 of ~30 tenant-scoped tables.

This phase closes those gaps additively — no existing table, column, or endpoint was removed.

---

## New tables

| Table | Purpose | Key fields |
|---|---|---|
| `scrum_tasks` | One row per planned commitment under a `ScrumEntry`. Replaces the JSON blob in `scrum_entries.today`. | `scrum_entry_id`, `employee_id`, `title`, `expected_output`, `measurement`, `task_status` (`PENDING\|IN_PROGRESS\|COMPLETED`), `completed_at`, `priority`, `kpi`, `planned_target`, `estimated_hours`, `actual_hours` |
| `scrum_blockers` | One row per blocker under a `ScrumEntry`. Replaces the JSON blob in `scrum_entries.blockers`. | `scrum_entry_id`, `title`, `severity` (`LOW\|MEDIUM\|HIGH\|CRITICAL`), `status` (`OPEN\|RESOLVED`), `resolved_at` |
| `work_sessions` | One row per clock-in → clock-out cycle. Owns break bookkeeping; `time_entries` remain the per-segment record used by timesheets/payroll (untouched). | `user_id`, `work_date`, `clock_in`, `clock_out`, `is_active`, `current_break_started_at`, `break_count`, `break_minutes`, `session_duration_minutes`. Partial unique index `work_sessions_one_active_per_user` enforces **one active session per user**. |
| `session_events` | Append-only activity timeline for a `WorkSession`. | `work_session_id`, `event_type` (`CLOCK_IN\|BREAK_START\|BREAK_END\|TASK_COMPLETED\|CLOCK_OUT`), `occurred_at`, `metadata` |
| `session_attachments` | Links or files attached to a `WorkSession` or a `ScrumTask` (exactly one of the two is set). | `work_session_id?`, `scrum_task_id?`, `type` (`GITHUB\|FIGMA\|PR\|GOOGLE_DOCS\|OTHER_LINK\|FILE`), `name`, `url?` (links), `storage_key?` (files, via existing `scrum-attachments` storage folder), `uploaded_by` |

### Extended existing tables (additive columns only)

- `scrum_entries`: `is_locked`, `submitted_at`, `project_id`, `client_id`, `kpi`, `planned_target`. `today`/`blockers` text columns remain but are now legacy/unused by the current UI.
- `time_entries`: `work_session_id` (nullable FK) — links a segment to its parent session; `NULL` for entries not tied to a session (backward compatible).
- `users`: `rejected_at`, `rejection_reason`; `UserStatus` enum gained `REJECTED`.
- `notification_type` enum gained `EMPLOYEE_APPROVAL_REQUEST`.

---

## New endpoints

### Daily Scrum tasks & blockers (`ScrumController`, base `/scrum-entries`)

| Method & path | Purpose |
|---|---|
| `GET /scrum-entries/:id/tasks` | List tasks for an entry |
| `POST /scrum-entries/:id/tasks` | Plan a task (409 if the day is already locked) |
| `PATCH /scrum-entries/tasks/:taskId` | Edit a task |
| `POST /scrum-entries/tasks/:taskId/complete` | Mark complete — recalculates parent entry `progress`/`status`/`isLocked` server-side |
| `DELETE /scrum-entries/tasks/:taskId` | Remove a task |
| `GET/POST /scrum-entries/:id/blockers`, `PATCH/POST resolve/DELETE /scrum-entries/blockers/:blockerId` | Mirrors tasks, using `resolve` instead of `complete` |

**Auto-lock rule** (ported from the old client-side `updateScrumProgressAndStatus`): `progress = round(completed/total*100)`; 100% → `status=COMPLETED`, `isLocked=true`, `submittedAt=now()`; `>0%` → `IN_PROGRESS`; else `NOT_STARTED`. Once locked, all task/blocker mutations return `409 Conflict`.

### Session tracking (`WorkSessionsController`, base `/work-sessions`)

| Method & path | Purpose |
|---|---|
| `GET /work-sessions/current` | Active (or today's most recent) session + computed `workedMinutes`, `onBreak`, `runningEntryId` |
| `POST /work-sessions/clock-in` | Starts a new session (409 if one is already active) + first `TimeEntry` segment |
| `POST /work-sessions/break/start` | Stops the running segment, starts the break clock |
| `POST /work-sessions/break/end` | Adds elapsed break minutes, resumes with a new segment carrying forward the prior context |
| `POST /work-sessions/clock-out` | Stops the running segment (or finalizes an in-progress break), computes `sessionDurationMinutes` |
| `GET /work-sessions/:id/events` | Raw ordered `SessionEvent` timeline (grouping repeated breaks is a frontend concern) |

Existing `POST /time-entries/start|stop` are unchanged and still used for ad-hoc manual entries not tied to a session.

### Attachments (`AttachmentsController`)

| Method & path | Purpose |
|---|---|
| `GET/POST /work-sessions/:id/attachments` | List / add a link attachment to a session |
| `POST /work-sessions/:id/attachments/file` | Multipart file upload (via existing `UploadService`, `scrum-attachments` folder, 10MB cap, same MIME allowlist as other uploads) |
| `GET/POST /scrum-entries/tasks/:id/attachments`, `.../attachments/file` | Same, scoped to a `ScrumTask` |
| `DELETE /attachments/:id` | Remove (only the uploader may delete) |

### Employee approval & notifications

| Method & path | Purpose |
|---|---|
| `POST /admin/users/:id/approve` | PENDING → ACTIVE; notifies + emails the employee |
| `POST /admin/users/:id/reject` | PENDING → REJECTED (optional reason); notifies + emails the employee |
| — | `AuthService.register()` now also creates an `EMPLOYEE_APPROVAL_REQUEST` notification for every org ADMIN |
| — | `AuthService.login()` now returns a distinct message for `REJECTED` accounts (previously only PENDING had one) |

The original implicit approval path (`PATCH /users/:id` with `status: ACTIVE, isApproved: true`) still works unchanged for backward compatibility.

### Timesheet history & progress analytics

| Method & path | Purpose |
|---|---|
| `GET /timesheets/history?range=7d\|30d\|month\|custom&from&to` | Per-day rollup (date, clockIn, clockOut, workMinutes, breakMinutes, totalMinutes, status) computed from `WorkSession` + `TimeEntry` |
| `GET /timesheets/history/export` | Same data as CSV |
| `GET /dashboard/progress` | Today's hours, weekly hours, break time, completed/total tasks, completion %, productivity %, KPI progress — all server-computed |

---

## RLS

`prisma/sql/rls.sql`'s `tenant_tables` array now covers the 5 new tables **and** every previously-uncovered existing tenant-scoped table (departments, teams, clients, projects, work_categories, holidays, time_entries, timesheets, scrum_entries, approvals, kpi_templates, kpi_progress, payroll_*, notifications, ai_*). Same `tenant_id = current_setting('app.tenant_id', true)::uuid` policy pattern as before — purely additive backstop, since the app layer already filters by `tenantId` via `PrismaService` middleware.

---

## Deferred / out of scope

- Full password-reset token flow (`AuthService.forgotPassword`/`resetPassword` remain stubbed `NotImplemented`) — orthogonal to this expansion.
- SessionEvent-driven activity timeline UI (the timesheets page's day timeline still derives from `TimeEntry` gaps client-side; only the "on break" flag was switched to the server's `WorkSession.onBreak`).
