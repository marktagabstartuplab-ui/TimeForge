# TimeForge — Production Backlog (the remaining ~8%)

**Date:** 2026-07-17
**Context:** After the live prod QA pass, the app is ~92% production-ready. Everything below is the
remaining ~8% — **none is a known-broken blocker.** Prioritized: operational risk first, then
low-severity UI, then unverified flows. Check items off as they're closed.

Legend: ⬜ open · 🔧 in progress · ✅ done
Effort: S (<1h) · M (half day) · L (1+ day)

---

## A. Operational — the cold-start amplifier (highest real-world risk for the demo)

### A1 ⬜ Railway cold-start latency — [Effort: S config / M infra]
- **Symptom:** first load when the stack is cold is slow — login form ~25s (blank until then),
  heavy admin/finance pages 10–20s. Railway hobby tier sleeps when idle + Vercel cold functions.
- **Impact:** looks broken in a demo (blank login for ~20s). Not a code defect.
- **Fix options (pick one):**
  1. Railway **paid tier** (no sleep) — cleanest.
  2. **Uptime pinger** (cron hitting `/api/v1/health` every few min) to keep it warm.
  3. Demo workaround: **warm the site ~2 min before presenting.**
- **Verify:** health endpoint responds <1s consistently; cold login form renders <3s.

### A2 ⬜ Finance AI Insights — first cold paint still heavy — [Effort: M]
- **File:** `apps/web/features/finance-ai/components/FinanceAiInsightsContent.tsx`
- **Done already (PR #47, merged):** `staleTime` + relaxed polling killed the *sustained* re-render
  storm.
- **Still open:** the **first** cold load fires all 5 heavy queries (dashboard/alerts/forecast/
  budget/liability) + renders 6 recharts charts at once.
- **Fix options:**
  1. **Lazy-load below-the-fold charts** (forecast/budget/cash-flow) — render on scroll into view.
  2. **Server-side cache** the 5 AI-aggregation endpoints (short TTL) so the calls are cheap.
  3. Consolidate the 5 endpoints into 1 combined `dashboard` payload.
  4. A2 is largely mooted once A1 (warm Railway) is done.

---

## B. Minor / cosmetic UI — from the July-14 QA list, still open (low severity)

### B1 ⬜ #29 — Notification "View details" links are blank — [Effort: S]
- **Symptom:** some notifications render a blank/broken "View details" link.
- **Root cause:** those `notifications.create(...)` calls omit `actionUrl`/`actionLabel`.
- **Where:** `apps/api/src/modules/notifications/notifications.service.ts` + every caller
  (grep `this.notifications.create(` across `apps/api/src/modules/**`). Ensure each passes a valid
  `actionUrl`. Also guard the frontend notification component to only render the link when
  `actionUrl` is non-empty.
- **Verify:** open each notification type; every one either navigates correctly or shows no link.

### B2 ⬜ #22 — "Edit Department" shows head's UUID instead of name — [Effort: S]
- **Symptom:** the department edit/detail view shows the manager's raw UUID, not their name.
- **Where:** department detail/edit component under `apps/web/features/org-management/` (the
  DepartmentDetail/edit surface) — resolve `managerId` → head's `firstName lastName`. Backend
  `departments` service may need to include the manager `{id, firstName, lastName}` like `/users`
  now includes `department {id,name}`.
- **Verify:** open Edit Department → head shows as a name.

### B3 ⬜ #20 — Redundant header buttons — [Effort: S]
- **Symptom:** Notifications / Settings / Sign-Out appear in BOTH the top header and the sidebar.
- **Where:** `apps/web/features/app-shell/components/AppTopBar.tsx` vs `AppSidebar.tsx` /
  `SidebarBottomSection.tsx`. Decide the single home for each and remove the duplicate.
- **Verify:** each control appears once.

### B4 ⬜ #21 — Display photo/avatar not shown across all role profiles — [Effort: S–M]
- **Symptom:** avatar missing on some role-based profile views.
- **Where:** avatar component + the `avatarUrl` signed-URL path (`shapeProfile` in
  `users.service.ts` signs `avatarKey`; check each profile surface actually consumes `avatarUrl`).
  Confirm the signed URL isn't expiring/blocked and every profile view renders it.
- **Verify:** upload an avatar; it shows on dashboard, profile modal, and admin employee row.

### B5 ⬜ #30 — Base-rate/payout visibility for employees — **PRODUCT DECISION, not a bug** — [Effort: S once decided]
- **Current:** `sanitize()` hides `hourlyRate` from non-finance/admin (BR-PAY-06). QA asked for
  employees to *see* their base rate + payout.
- **Action:** get the product call. If "yes, show it," relax the sanitize rule for self-reads only
  (an employee seeing their OWN rate), not for viewing others.

---

## C. Unverified functional flows — likely fine, but NOT click-verified on prod

### C1 ⬜ Admin write actions on prod — [Effort: S each to verify]
- **approve** a pending account (dept/role/employment modal → confirm), **invite employee**
  (sends email + creates account), **create department** (UI updates immediately).
- **Note:** surfaces verified live (lists load, buttons present, modals exist on localhost).
  Not executed on prod to avoid mutating real data. Verify with a throwaway inbox/account.

### C2 ⬜ Timesheet full cycle — [Effort: M]
- Employee submit → appears in supervisor's dept queue → supervisor reject w/ remark → timesheet
  unlocks + remark visible → employee edits + resubmits → PDF download.
- Endpoints returned 200 + dept-scoped data earlier; the happy-path click-through wasn't driven.

### C3 ⬜ Team Schedule — [Effort: M]
- Add Shift (no false "overlap" error), Save Draft → close → reopen (persists), department dropdown
  shows names.

### C4 ⬜ Midnight auto-close — [Effort: M, timing-dependent]
- A session left open past midnight should auto-stop. Hard to trigger on demand — verify via a
  worker/cron test or by manipulating a session's clock-in date in a staging DB.

### C5 ⬜ Mobile layout — [Effort: S to check]
- DevTools device toolbar (or a phone): layouts render, sidebar collapses to a menu, no horizontal
  scroll on key pages (dashboard, daily scrum, timesheets, finance).

### C6 ⬜ Supervisor unlock happy-path on prod — [Effort: S]
- RBAC + mandatory-reason are confirmed live (422 short reason, 403 cross-dept). The actual
  click-through of unlocking a **real locked entry** in the supervisor's dept wasn't set up on prod
  (was fully verified on localhost with screenshots).

---

## Suggested order to close it out
1. **A1 (warm Railway)** — biggest UX win, fixes cold login + AI Insights first paint at once.
2. **B1 #29** + **B2 #22** — quick, verifiable code fixes (S each).
3. **C2 timesheet cycle** — most important un-driven flow; verify live.
4. **B3/B4/B5** cosmetic + the product decision.
5. **A2 lazy-load charts** — only if A1 doesn't make it a non-issue.
6. **C1/C3/C4/C5/C6** — verification passes; fix only if something actually breaks.

## Related docs
- `docs/ADMIN-HR-FINANCE-LIVE-QA-2026-07-17.md` — the live QA scorecard + AI-Insights diagnosis
- `docs/MANUAL-QA-SCRIPT.md` — full step-by-step manual test script (per role)
- `docs/HANDOFF-CONTEXT-2026-07-14.md` — architecture, git state, email (now confirmed working)
