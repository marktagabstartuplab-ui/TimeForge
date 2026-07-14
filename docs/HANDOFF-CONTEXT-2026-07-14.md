# TimeForge — Session Handoff & Context (2026-07-14)

> Purpose: a complete context dump so another Claude Code / opencode session can continue
> **without re-deriving anything**. Read this first. Everything below is verified against the
> running code/API this session unless marked otherwise.

---

## 0. TL;DR — where things stand

- Branch in play: **`feat/department-supervision-phase3`** (this is the most up-to-date branch; `main` is BEHIND it).
- Feature work is **done**. Remaining work is **QA hardening + the email system (infra) + a live browser QA pass**.
- The **email problem is infrastructure/config, NOT code** — see §4. This is the #1 production blocker.
- Browser pane in this environment is **flaky** (React login page intermittently won't hydrate → screenshots time out, form does native GET). API-level verification is reliable and authoritative for most checks.

---

## 1. Git state (CRITICAL — read carefully)

Current branch: `feat/department-supervision-phase3`

Local commits ahead of `origin/main`, newest first:
```
3d0787d  fix(qa): HR sidebar scope, employee-list department name, strip user secrets   <-- NOT pushed
472d2a4  feat(scrum): require unlock reason; fix admin org-wide unlock access            <-- pushed, in PR #34 (OPEN)
85dbe19  feat(scrum): supervisor unlock of Today's Commitment + Marketing demo dept      <-- merged to main via PR #33
64bc4b2  feat(seed): assign department heads
77cec65  feat(seed): pending@demo.test account
```

### What is / isn't on `main`
- `main` HEAD = `32b6fe8` (merge of PR #33) → contains ONLY up to `85dbe19`.
- **`472d2a4` (mandatory unlock reason + admin org-wide unlock fix) is NOT on main** → it's in **open PR #34** (`feat(scrum): mandatory unlock reason + admin org-wide unlock fix`). MERGE THIS.
- **`3d0787d` (HR sidebar + dept-name + security fix) is committed locally but NOT pushed.** Needs `git push origin feat/department-supervision-phase3`, then it joins PR #34 (same branch/head).

### Action items for git
1. `git push origin feat/department-supervision-phase3` (pushes `3d0787d`).
2. Merge **PR #34** to main (brings `472d2a4` + `3d0787d`).
3. Optional cleanup: delete stale merged branches (see §9).

### GitHub
- Repo: `marktagabstartuplab-ui/TimeForge` (origin). `gh` authed as `Mart271`.
- PR #33 = MERGED (unlock v1). PR #34 = OPEN (unlock hardening + qa fixes on same branch).

---

## 2. What was built/fixed across recent sessions

### Supervisor Unlock of "Today's Commitment" (feature)
- `POST /scrum/:id/unlock` on `ScrumDashboardController` (path `scrum`).
- `ScrumService.unlockEntry()` — sets `isLocked=false`, audit log (`event: SCRUM_ENTRY_UNLOCKED` + reason/employeeId/departmentId/entryDate), notifies employee.
- **Mandatory reason** (commit `472d2a4`): `UnlockScrumEntryDto.reason` required `@MinLength(5)`; service re-guards trimmed length; web modal disables Unlock until ≥5 chars.
- **Admin org-wide fix** (`472d2a4`): `SCRUM_READ_ORG` holders (Admin via `*`) bypass the department `isInTeam()` check; Supervisors still dept-scoped; HR/Finance/Employee refused.
- Files: `apps/api/src/modules/scrum/{dto.ts, scrum.service.ts, scrum-dashboard.controller.ts}`, `apps/web/features/scrum-management/{api/scrum-management.service.ts, components/TeamScrumSubmissionsContent.tsx}`.
- No DB migration (reuses `isLocked`, `ADMIN_ACTION`, `ANNOUNCEMENT`).

### QA fixes (commit `3d0787d`, NOT pushed)
- **HR sidebar** (`apps/api/src/modules/navigation/navigation.service.ts`): HR-only users no longer see `employees`, `departments`, or any `SYSTEM` item. Added `const isHrOnly = user.roles.includes('HR') && !isAdmin;` and a filter line. Admin/Supervisor unaffected.
- **Employee list dept name** (`apps/api/src/modules/users/users.service.ts` `findAll`): added `department: { select: { id: true, name: true } }` to the include. Frontend `EmployeeTable.tsx` already renders `r.department?.name`, so it was showing "—".
- **SECURITY** (`users.service.ts` `sanitize()`): now strips `passwordResetToken`, `passwordResetExpiresAt`, `emailVerificationToken`, `emailVerificationExpiresAt`, `failedLoginAttempts`, `lockoutUntil` (plus existing `passwordHash`). These were leaking on every `/users` response = account-takeover vector.

### Seed additions
- `supervisor2@demo.test` → Marketing dept head; `marketing@demo.test` → Marketing employee (reports to supervisor2). For department-isolation testing. In `prisma/seed.ts`.

---

## 3. Demo accounts (all password `ChangeMe123!`)

| Email | Role | Department |
|---|---|---|
| `admin@demo.test` | Admin | — (org-wide) |
| `supervisor@demo.test` | Supervisor | Engineering (head) |
| `supervisor2@demo.test` | Supervisor | Marketing (head) |
| `employee@demo.test` | Employee | Engineering |
| `intern@demo.test` | Intern (EMPLOYEE role + INTERN employment) | Engineering |
| `marketing@demo.test` | Employee | Marketing |
| `hr@demo.test` | HR | Human Resources (head) |
| `finance@demo.test` | Finance | — (org-wide) |
| `pending@demo.test` | pending approval | — |

~9 junk QA accounts (timestamped emails) are already **soft-deleted** (deletedAt set) — ignore them.

---

## 4. EMAIL SYSTEM — diagnosis (#1 production blocker)

**The code is correct. The problem is infrastructure/config.** Do NOT rewrite mailer logic.

### How it works
- `apps/api/src/infra/mailer.service.ts` resolves ONE strategy from `MAIL_DRIVER` (default `auto`):
  - `auto` → **edge** if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set; else **smtp** if `SMTP_USER`/`SMTP_PASS`; else **mock** (console log).
- Edge strategy calls `${SUPABASE_URL}/functions/v1/send-email` with `Authorization: Bearer <SERVICE_ROLE_KEY>`.
- Edge function: `supabase/functions/send-email/index.ts` (Deno + Nodemailer → Gmail SMTP). **Needs its OWN secrets** set on the Supabase project: `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM` via `supabase secrets set ...`. These are a SEPARATE store from the app's env.
- **All send failures are caught & logged** by callers (registration/approval/etc.) so business ops never roll back → **emails fail SILENTLY** = exact QA symptom "no email received".

### Why prod email fails (most likely, in order)
1. **Supabase edge function secrets not set** (`SMTP_USER`/`SMTP_PASS` missing on the Supabase project) → edge fn returns 500 "SMTP credentials not configured".
2. **Edge function not deployed** → 404. Deploy: `supabase functions deploy send-email --project-ref rfwqxeboudsjykhghbjk`.
3. **Railway missing `SUPABASE_SERVICE_ROLE_KEY`** → mailer falls back to SMTP, which **Railway blocks outbound** → silent fail. (Memory: never re-add SMTP creds to Railway expecting them to work — Railway blocks SMTP.)
4. Gmail requires an **App Password** (not the account password) + 2FA enabled.
5. Note: prompt mentions **Resend** — there is currently **NO Resend integration**. If they want Resend, it'd be a new provider (swap the edge fn body or add a strategy). Not built.

### How to verify (needs infra access I don't have here)
- Check Railway env has: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_DRIVER=auto` (or `edge`).
- Test the deployed edge fn directly:
  ```bash
  curl -i -X POST "https://rfwqxeboudsjykhghbjk.supabase.co/functions/v1/send-email" \
    -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" \
    -d '{"to":"you@real.com","subject":"test","body":"hello"}'
  ```
  - 200 + messageId → email works; problem is Railway env not reaching edge.
  - 500 "SMTP credentials not configured" → run `supabase secrets set SMTP_USER=... SMTP_PASS=... SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_FROM='TimeForge <..>'`.
  - 404 → deploy the function.
- Startup log line reveals the resolved strategy: look for `Mailer strategy: ...` in Railway logs. If it says **MOCK**, no Supabase/SMTP creds are set on Railway.

### Config source
- `apps/api/src/config/configuration.ts` + `env.validation.ts` — how `supabase`, `smtp`, `mail` config objects are built from env. Check these for exact env var names.

---

## 5. QA issue status (from July-14 QA PDFs) — verified this session

Fixed this session (commit `3d0787d`): **#24, #31, #35 + security leak**. Verified via API.

| # | Issue | Status |
|---|---|---|
| 2,3,4,5,6,9,10 | Registration: requested role / approval wait / back btn / no dup dept / phone +63 / no dup terms / password strength | ✅ Already Fixed (code) |
| 7 | Contact Support link | ✅ Fixed (email address inside modal not re-confirmed) |
| 8,27,32 | Password-change/Forgot-Password/Invite **email delivery** | ⚠️ Still Open — INFRA (see §4) |
| 11 | Dashboard Assigned Project on top | ✅ Fixed |
| 12,33,36 | Department shows UUID (scrum/approval/request) | ✅ Fixed (selectors render names) |
| 14 | Download PDF | ✅ Fixed |
| 17 | Supervisor comment not visible | ✅ Fixed (→ supervisorNote + notification) |
| 18 | Assign supervisor | ✅ Fixed (phase 2/3 approval) |
| 19,23 | Create supervisor/hr/finance at signup | ✅ By design — admin assigns on approval |
| 24 | HR sees System/Management sidebar | ✅ **Fixed this pass** |
| 31 | Admin employee list dept blank | ✅ **Fixed this pass** |
| 35 | Remove Employee/Dept from HR sidebar | ✅ **Fixed this pass** |
| — | /users leaked reset/verify tokens | ✅ **Fixed this pass (security)** |
| 13,15,16,26 | Daily-Scrum/EOD cluster (too many commitments, time inconsistency, EOD clickable before lock, locked commitments not on EOD) | ⚠️ Still Open — needs LIVE browser repro |
| 20 | Redundant header buttons (notif/settings/signout) | ⚠️ Still Open (cosmetic) |
| 21 | Display photo across profiles | ⚠️ Still Open — investigate avatar render |
| 22 | Edit Department shows UUID not head name | ⚠️ Still Open — not verified |
| 25 | Intern labeled "Employee" | ⚠️ Still Open (minor; intern = EMPLOYEE role + INTERN employmentType; label shows role) |
| 28 | Project/Client not on saved work details | ⚠️ Still Open — investigate |
| 29 | Notification "view details" blank link | ⚠️ Still Open — some notifications lack `actionUrl`; audit `notifications.service` callers |
| 30 | Employee should see base rate/payout | 📋 By Design (conflicts with BR-PAY-06 hiding rate; product decision) |
| 34 | Submitted timesheet not in supervisor queue | 🚫 Cannot Reproduce — endpoints 200 + dept-scoped; no SUBMITTED timesheet in seed. Needs data-driven retest |

---

## 6. Notification action-URL audit (#29 — next quick win)
- Notifications created in `apps/api/src/modules/notifications/notifications.service.ts` and by callers (scrum, leave, timesheets, approvals).
- Some `notifications.create(...)` calls likely omit `actionUrl`/`actionLabel` → frontend "View details" renders blank.
- Fix approach: grep for `this.notifications.create(` across `apps/api/src/modules/**`, ensure each passes a valid `actionUrl`. Frontend notification component should also guard: only render the link when `actionUrl` is non-empty.

---

## 7. Build / verify commands (all PASSED this session unless noted)
```bash
# From repo root: C:\Users\USER\Claude\Projects\TImeForge
npx tsc --noEmit -p apps/api/tsconfig.app.json     # API typecheck  -> 0 errors
npx tsc --noEmit  --project apps/web/tsconfig.json  # or: npm --prefix apps/web run build (Vercel parity)
npx nest build api        # -> exit 0
npx nest build worker     # -> exit 0
npm --prefix apps/web run build   # next build -> exit 0
npx prisma validate       # -> valid
npm run db:seed           # idempotent
```
Monorepo: NestJS builds run from ROOT (`nest build api`), not from apps/api (no tsconfig.json there; uses tsconfig.app.json).

### Running locally
- `.claude/launch.json` has `api` (3000), `web` (3001), `worker`. Use preview_start by name.
- Web → API base: `apps/web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:3000`.
- **Node fetch gotcha**: use `http://127.0.0.1:3000` in scripts, NOT `localhost` (Node resolves localhost→IPv6 ::1, server is IPv4 → ECONNREFUSED).
- DB is remote Supabase (Postgres) — reachable without local Postgres. Redis needed for BullMQ/worker only.

---

## 8. Deployment
- Frontend: Vercel project **`time-forge`** (time-forge-pi.vercel.app). Builds green on this branch.
- There was a duplicate Vercel project **`time-forge-n2gg`** the user isn't using → causes red checks on every branch (misconfigured root dir). User should delete/disconnect it in Vercel dashboard.
- Old branches (#30 phase1, #31 phase2, #29 mailer) show RED Vercel builds because their tips PREDATE the `setRefreshTokenMemory` export fix (`apps/web/lib/api/client.ts` line ~44). `main` HAS the export → main builds green. Those red rows are stale/harmless; delete the branches to clear them.
- Backend/Worker: Railway. No new migration or env var from recent work.

---

## 9. Stale branch cleanup (optional, user-approved pattern)
Merged into main (safe to delete): `feat/department-supervision-phase2`, `fix/mailer-prefer-edge-function`, `feat/show-requested-role-in-approvals`, `fix/registration-build-missing-refresh-token-export`, `feat/leave-attachments`.
Do NOT delete `feat/department-supervision-phase1` (tip not ancestor of main) or the active `feat/department-supervision-phase3`.

---

## 10. Architecture invariants (don't break)
- Tenant isolation: JWT → AsyncLocalStorage → Prisma middleware → RLS (4 layers).
- Supervisor scoping: `DepartmentScopeService` (`apps/api/src/common/scoping/department-scope.service.ts`) is the SINGLE source of truth. Supervisor governs departments where `Department.managerId == them`. All `*:read_team` services delegate to it.
- Currency PHP (₱) everywhere, never `$`.
- Idempotency-Key on bulk/payroll/AI. Audit log + Notification on every mutating HR/payroll/AI action.
- RBAC: `@RequirePermissions` guard; catalog in `packages/shared/src/permissions.ts`. Nav catalog: `apps/api/src/modules/navigation/navigation.service.ts`.
- `SCRUM_READ_ORG` = admin-only (via wildcard). HR/Finance do NOT have it.

---

## 11. Remaining work queue (priority order for next session)
1. **Email (infra)** — verify Railway env + Supabase edge fn secrets; test edge fn via curl (§4). Highest priority.
2. **Push `3d0787d` + merge PR #34** so main is current.
3. **Notification action URLs (#29)** — quick code fix (§6).
4. **Live browser QA** of Daily-Scrum/EOD cluster (#13,15,16,26), Leave attachments (upload/preview/download), and per-role smoke tests — needs a working browser (this session's pane was flaky; try a fresh session / real Chrome).
5. **Minor/cosmetic**: #20, #21, #22, #25.
6. **Product decision**: #30 (base-rate visibility) — ask user.

## 12. Verification method caveat
Everything marked "Fixed"/"Cannot Reproduce" this session was verified via **live API calls** against the local API (real logins, real endpoint responses) + code inspection. **Full browser click-through was NOT completed** this session due to browser-pane hydration flakiness (login page wouldn't hydrate → native GET). Re-verify UI in a working browser before the capstone demo. The unlock feature WAS fully browser-verified in an earlier session (screenshots captured: locked badge, modal, disabled-until-reason, success, employee notification).
