# TimeForge — Backend Release-Candidate Review

> Scope: backend only, implementation vs frozen Phase 1–4. **Review only — no changes made.**
> Method: static read of controllers/services/schema/worker across all modules.

## Summary

The backend is comprehensive and, on the whole, well-engineered: consistent tenant + org filtering, optimistic locking, soft deletes, cursor pagination, a correct primary approval path, transactional payroll generation, privacy-preserving AI, and idempotency on AI/Admin. The issues below are mostly **contract-completeness and one authorization-integrity bug**, not architectural flaws.

**1 Critical · 1 High · 6 Medium · 5 Low.**

---

## CRITICAL

### C1 — Duplicate approval path allows self-approval and cross-team approval
- **Module:** Timesheets
- **Endpoint:** `POST /api/v1/timesheets/:id/decide` (guarded by `approval:decide`)
- **Risk:** A user holding `approval:decide` (Supervisor/Admin — and supervisors also submit their own timesheets) can **approve their own timesheet** (violates BR-APP-04) and **approve a timesheet outside their team** (violates BR-APP-03). No `Approval` trail row is written and KPI progress is not updated. The approved hours then flow into payroll, so this corrupts the money path.
- **Root cause:** `TimesheetsService.decide()` re-implements the `SUBMITTED|UNDER_REVIEW → APPROVED/REJECTED/REVISION_REQUESTED` transition but omits the self-approval guard, team-scope check, `Approval` record creation, and KPI update that the correct `ApprovalsService.decide()` (`POST /approvals/:timesheetId/decision`) performs. Both endpoints are exposed.
- **Minimal fix:** Remove `decide` from `TimesheetsController` + `TimesheetsService` and keep `/approvals/:timesheetId/decision` as the single approval path. (If it must stay, have it delegate to `ApprovalsService.decide` so the guards run.)

---

## HIGH

### H1 — Payroll export: no LOCKED precondition, repeatable, not idempotent, not audited
- **Module:** Payroll
- **Endpoint:** `POST /api/v1/payroll/periods/:id/export`
- **Risk:** `exportReport()` only blocks `status === 'OPEN'`, so a **GENERATED (un-locked) period can be exported**, and an **already-EXPORTED period can be exported again** — weakening the frozen "immutable after export" rule (BR-PAY-04). No `Idempotency-Key` is enforced (Phase 4 marks money mutations as key-required), and no `AuditLog(PAYROLL_EXPORT)` is written (Phase 3 lists it as a required audited action).
- **Root cause:** single `status === 'OPEN'` check; missing idempotency + audit that AI/Admin already have.
- **Minimal fix:** require `status === 'LOCKED'`; return 409 if already `EXPORTED`; enforce `Idempotency-Key` (reuse the AI/Admin pattern); add `auditLog.create(AuditAction.PAYROLL_EXPORT)`.

---

## MEDIUM

### M1 — Single approval decisions not written to the immutable audit log
- **Module:** Approvals · **Endpoint:** `POST /approvals/:timesheetId/decision`
- **Risk:** APPROVE/REJECT/REVISION_REQUEST are stored in the `Approval` table but **not** in `audit_log`. Phase 3 lists these as required immutable audit actions (only the Admin *bulk* approve writes `APPROVE`).
- **Root cause:** `ApprovalsService.decide()` creates an `Approval` row but no `AuditLog`.
- **Minimal fix:** add `auditLog.create(APPROVE|REJECT|REVISION_REQUEST)` inside the existing `$transaction`.

### M2 — Idempotency-Key not enforced on payroll generate/export
- **Module:** Payroll · **Endpoints:** `POST /payroll/periods/:id/generate`, `/export`
- **Risk:** Phase 4 requires an idempotency key on money mutations; here it's only "recommended" in comments. Retries can re-process. (Partly mitigated: generate deletes the prior report first.)
- **Root cause:** no idempotency check in the service (AI/Admin implement it; Payroll does not).
- **Minimal fix:** apply the existing idempotency helper to generate/export.

### M3 — Timesheet submit doesn't enforce documented business value / linked entries
- **Module:** Timesheets · **Endpoint:** `POST /timesheets/:id/submit`
- **Risk:** An empty timesheet (0 attached entries, no summary) can be submitted; Phase 1 BR-TS-01 requires documented business value + outputs before submission.
- **Root cause:** `submit()` recalculates `totalMinutes` but has no minimum-content guard.
- **Minimal fix:** require ≥1 attached non-deleted entry and a non-empty `summary` (or non-empty entry descriptions); else 422.

### M4 — Tenant auto-scoping backstop and RLS cover only the foundation tables
- **Module:** Common `PrismaService` (`TENANT_MODELS`), Infra `prisma/sql/rls.sql`
- **Risk:** The Prisma middleware and RLS SQL include ~10 models but **not** most business tables (TimeEntry, Timesheet, Approval, Payroll*, Kpi*, ScrumEntry, Department/Team/Project/Client/WorkCategory/Holiday, AiAudit). No active leak was found — every service filters `tenant_id` + `organization_id` explicitly — but the "developer-proof" backstop and DB-level RLS are incomplete, so a future query that forgets a filter would leak.
- **Root cause:** models added across phases weren't appended to the backstop lists.
- **Minimal fix:** add all tenant-scoped models to `TENANT_MODELS`; extend `rls.sql` to all business tables before enabling RLS in prod.

### M5 — Swagger is inconsistent across modules
- **Module:** API docs (`/api/docs`)
- **Risk:** Swagger is set up with bearer auth, but request/response schemas for the **spine** modules (time-tracking, timesheets, scrum, approvals, kpi, payroll, users, core-org) are under-documented (DTOs lack `@ApiProperty`/`@ApiTags`); newer modules (ai, admin, dashboard, rbac, notifications, audit) are annotated. "Swagger accuracy" is therefore partial.
- **Root cause:** `@ApiProperty`/`@ApiTags` were added to later modules only.
- **Minimal fix:** add `@ApiTags` to spine controllers and `@ApiProperty` to spine DTOs (mechanical, no logic change).

### M6 — Auth endpoints not rate-limited more strictly than the global tier
- **Module:** Auth · **Endpoints:** `POST /auth/login`, `/refresh`, `/forgot-password`
- **Risk:** Global throttler is 120/min; Phase 4 specified AUTH_STRICT (login 5/min, forgot 3/min). Weaker brute-force protection.
- **Root cause:** no per-route `@Throttle` override.
- **Minimal fix:** add `@Throttle` to the auth routes.

---

## LOW

- **L1 — Timesheets `POST /:id/payroll-ready`** (`markPayrollReady`) takes no `version` → no optimistic lock on that transition. *Fix:* accept + check `version`.
- **L2 — Approvals:** KPI progress update runs **after** the decision `$transaction`; if it throws, the approval is committed but KPI isn't. *Fix:* move it inside the transaction or make it an after-commit domain event.
- **L3 — AI `GET /ai/jobs`:** mixes Prisma `cursor:{id}` with `orderBy: createdAt desc`, which can mis-page. *Fix:* order by `[createdAt, id]` (or cursor by the same field ordered on).
- **L4 — Time Tracking:** "one running timer per user" (BR-TIME-02) is enforced only in the service, not by a DB partial-unique index → race under concurrency. *Fix:* add the partial unique index via SQL.
- **L5 — Payroll export is synchronous** returning full report data; Phase 4 specified `202` + async BullMQ. Acceptable MVP deviation; note for contract parity.

---

## What's solid (verified)

Auth (Argon2, rotating refresh with reuse detection, LOGIN/LOGOUT audit) · RBAC guard (default-deny, `*` wildcard, permission catalog matches Phase 1) · explicit tenant+org+`deletedAt` filtering across services · optimistic locking on the main mutations · approvals primary path (no-self-approval, team scope, mandatory remark, transaction, KPI update) · payroll eligibility filter (`payroll_eligible` + `ACTIVE`, interns excluded, BR-PAY-05) and rate/amount privacy (BR-PAY-06: `hourlyRate` stripped from user responses, `/payroll/me` returns hours only) · AI queue (permission + tenant-scoped subject validation, idempotency, `AI_USAGE` audit, BullMQ retries, privacy-preserving results — no raw prompt/response, only hashes) · global ValidationPipe (whitelist, forbid-unknown, 422) · comprehensive audit coverage for admin/org/rbac/users/ai/auth actions.

---

## Backend Release Readiness Score: **82 / 100**

Deductions: Critical −8 (self-approval on the money path), High −5, Medium −6, Low −2.5. The base is high because coverage, tenancy, locking, and the primary workflows are correct.

## Recommendation: **FIX ITEMS FIRST**

Blockers before shipping the approval → payroll flow: **C1** (self-approval duplicate path) and **H1** (payroll export lock/idempotency/audit). These two, plus **M1** (approval audit) and **M2** (payroll idempotency), are small, localized fixes.

The frontend can begin **in parallel now** against the modules not touched by C1/H1 (auth, org, users, time tracking, scrum, KPI reads, dashboards) — but do not wire the live "approve → payroll export" path into a demo until C1/H1 are closed.
