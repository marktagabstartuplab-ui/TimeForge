# TimeForge Bug Fix Prompts — Phase 3

Source: `TimeForge (3).docx` and `TimeForge (4).docx` (QA findings from latest testing cycle).

**How to use this:** Run one at a time, in a fresh session or clearly separated turn, in the suggested order below. Never batch multiple prompts into one request — that's what causes fixing one bug to silently break another. Each prompt has a hard scope boundary, a "do not touch" list, and its own verification checklist.

---

## Shared rules (paste once per session, or keep in CLAUDE.md)

```
Before making any change:
1. State which files you intend to touch and why. Do not touch any file
   outside that list without asking first.
2. Read the existing code path fully before editing — don't guess at
   function signatures or DB schema.
3. Make the smallest change that fixes the described bug. Do not refactor,
   rename, or "clean up" unrelated code in the same file.
4. After the change, run any existing relevant tests (`npm run test` for
   the affected app) and confirm they pass. If no test covers this path,
   note that explicitly rather than skipping verification.
5. Summarize exactly what changed (files + diff summary) and explicitly
   call out any other feature/module that could be affected, so it can
   be spot-checked.
6. If the fix requires a schema change, generate a Prisma migration —
   don't hand-edit the DB.
```

---

## BUG-AE — Incorrect Shift Limit Configuration: System allows shifts up to 13 hours

**Where:** Daily Scrum module > Active Session timer and Shift Limit progress bar

```
Fix: the system's maximum shift limit is set to 13 hours instead of 12.
The progress bar displays "SHIFT LIMIT --- 13H" and at 12h 12m elapsed,
the warning states "Your 13 hours limit is reached in 48 minutes." This
violates the intended 12-hour maximum.

Expected: the maximum shift duration is capped at exactly 12 hours. The
progress bar should reflect "SHIFT LIMIT --- 12H", and the system should
enforce a hard stop (auto-clock-out) at exactly 12 hours.

Scope: backend (shift configuration constants, session max calculation),
frontend (progress bar math, warning message templates).

Likely root cause: hardcoded `13` value in shift-limits.config.ts or
progress bar denominator calculation in CurrentSessionCard.tsx.

Do not touch: clock in/out endpoints, timesheet calculation, payroll
integration, time entries schema.

Verify: (a) progress bar at 8h shows ~67%, (b) at 11h shows ~92%, (c)
at 12h auto-clock-out triggers, (d) all UI text says "12 hours" not
"13 hours", (e) no shift > 12h can be created, (f) `npm run test` passes.
```

---

## BUG-AF — "My Timesheet" Shows Zero Records Despite Existing Entries

**Where:** Timesheets module > "My Timesheet" section (summary cards + list)

```
Fix: the timesheet summary cards display 0m Work Hours, 0m Break Hours,
0 Days Logged and show "No sessions recorded in this range" even though
the Timesheet Entry Audit below contains data and notifications show
unread entries for this user.

Expected: the summary cards and list should accurately pull and display
the user's logged data for the active date filter. If entries exist in
the range, they must be visible.

Scope: frontend data binding (MyTimesheet.tsx, useTimesheetData hook) or
backend query (time-tracking.service.ts getTimesheetSummary endpoint).
Likely root causes: (1) frontend not reading fetched data from state,
(2) backend date-range filter broken (e.g., "Last 7 Days" calculating
wrong start/end), (3) mismatch between filter dates and entry dates.

Before editing: check browser Network tab to see if API response contains
data. If response is empty, issue is backend. If response has data but
UI shows empty, issue is frontend binding.

Do not touch: Timesheet Entry Audit (that component works), approval
workflow, payroll integration.

Verify: (a) create a time entry, (b) immediately (no refresh) check if
summary updates, (c) filter by "Last 7 Days" — entries within last 7
days must show, (d) filter by "Today" — only today's entries show, (e)
summary total matches Entry Audit list below, (f) no console errors.
```

---

## BUG-AG — "Team Status" Panel Visible on Employee Payroll Page (Privacy Issue)

**Where:** Finance & Reports > Payroll (Payslips view) > Right-side panel

```
Fix: the "Team Status" widget (showing colleagues' real-time clock-in/
out statuses) is rendered on a regular employee's personal Payroll/
Payslips page. This information is irrelevant to payroll and violates
privacy expectations — it's meant for supervisor/admin dashboards.

Expected: the Team Status component should be removed entirely from the
employee's Payroll page. The layout should adjust to utilize the freed
space (e.g., expanding the Weekly Tracked Hours chart to full width).

Scope: frontend PayrollLayout component or layout grid. Conditional
rendering: Team Status should only appear for SUPERVISOR or ADMIN roles.

Do not touch: Team Status component itself (reuse elsewhere), payroll
data display, permissions logic.

Verify: (a) login as Employee, navigate to Payroll — no Team Status
visible, (b) Weekly Tracked Hours expands to fill right side, (c) login
as Supervisor, navigate to Payroll — Team Status visible (if this page
is supervisor-accessible), (d) mobile layout responsive, (e) no console
errors.
```

---

## BUG-AH — System-Wide Icon Color Consistency (Standard + Phased Implementation)

**Reference:** `icon-color-system.md` (standard), `icon-reference.md` (lookup),
`icon-implementation-prompt.md` (per-bug execution plan).

> **Revised 2026-08-05 against the codebase.** The original specs below named
> `feather-icons-react`, `#0066CC` as primary, six leave types, and six sidebar
> sections — none of which exist here. Colors were `-500`/`-600` shades that **fail**
> WCAG AA on light tints. Corrected values are used throughout. All colors are
> Tailwind `-700`; use the class, not the hex.

**Global rules for every BUG-AH:**
- Library is **`lucide-react`** (already installed). Do not add `feather-icons-react`.
- Color via Tailwind class, never inline `style={{ color }}` — the app is Tailwind v4
  with `@theme` tokens and a `.dark` variant, both of which inline hex bypasses.
- Fix the **shared component**, not N call sites.
- `apps/web` has no test runner. Gates are:
  `cd apps/web && npx next typegen && npx tsc --noEmit --incremental false && npx eslint .`

**Revised order** (was: AH-1 first — it is now blocked):
1. BUG-AH-3 (Approval icons — highest value, one file does most of it)
2. BUG-AH-6 (Alert icons — contains a real `Toast` bug)
3. BUG-AH-2 (Time/Clock icons)
4. BUG-AH-7 (Leave/Card icons)
5. BUG-AH-5 (Action icons)
6. BUG-AH-4 (Navigation icons — most invasive, touches API + web)
7. BUG-AH-1 (Status icons — **BLOCKED**, feature does not exist)

---

## BUG-AH-1 — Status Icon Colors (Attendance / Presence) — ⚠️ BLOCKED

**Status:** Cannot be implemented. `PRESENT` / `LATE` / `ABSENT` / `ON_LEAVE` exist
nowhere in the schema, API, or web app — only in planning docs
(`hr-attendance-schedule-improvements.md`, `feature-build-prompts.md`). Ship the
attendance-status feature first.

**Unblocking work that *is* actionable now:** `components/shared/StatusBadge.tsx` is
text-only — it renders no icon at all. Adding an optional icon per tone is the
prerequisite for this bug and delivers BUG-AH-3 immediately.

```
Fix: StatusBadge renders a label with no icon, so status is communicated by
color and text alone with no glyph.

Expected: add an optional `icon?: LucideIcon` to StatusBadge, rendered before
the label at h-3.5 w-3.5 with aria-hidden="true". Default undefined so every
existing call site is unchanged.

Scope: apps/web/components/shared/StatusBadge.tsx only.

Do not touch: status logic, data model, attendance calculation, the tone→label
mapping functions.

Verify: (a) existing badges render identically when no icon is passed,
(b) typecheck + lint clean, (c) icon aligns on the text baseline.

When attendance statuses land, apply: PRESENT check-circle green-700, LATE
alert-circle amber-700, ABSENT x-circle red-700, ON_LEAVE calendar cyan-700,
CLOCKED_IN play-circle green-700, CLOCKED_OUT stop-circle brand-muted.
```

---

## BUG-AH-2 — Time & Clock Icon Colors

**Where:** `features/time-tracking/components/`, `features/timesheets/components/`,
`features/dashboard/components/`, `components/shared/MetricCard.tsx`,
`components/shared/StatCard.tsx`

```
Fix: time-related icons lack consistent coloring. Work Hours, Break Hours,
Overtime, Holiday and Shift icons are uncolored or inconsistent. StatCard
hardcodes text-brand for every icon, so no time concept can be distinguished.

Expected:
- TIME_WORKED:  Clock       text-brand        bg-blue-50
- BREAK_TIME:   Coffee      text-orange-700   bg-orange-50
- OVERTIME:     AlertCircle text-amber-700    bg-amber-50
- HOLIDAY:      Star        text-cyan-700     bg-cyan-50
- SHIFT:        BarChart3   text-green-700    bg-green-50

Add an `iconTone?: string` prop to StatCard mirroring the one MetricCard
already has, defaulting to the current "text-brand" so existing call sites
are unaffected. Then pass tones at the time-tracking call sites.

Scope: frontend only — MetricCard/StatCard plus their call sites.

Do not touch: time calculations, payroll logic, timesheet submission.

Verify: (a) each concept shows its color, (b) StatCard without iconTone looks
identical to before, (c) tints readable at 375px and with .dark applied,
(d) typecheck + lint clean.
```

---

## BUG-AH-3 — Approval & Workflow Icon Colors

**Where:** `components/shared/StatusBadge.tsx` (primary),
`features/timesheet-oversight/`, `features/supervisor-leave/`,
`features/scrum-management/`

```
Fix: approval statuses render as text-only badges with no icon, and the tone
colors use -600 shades that fall below 4.5:1 against their -50 tints
(green 3.15:1, amber 3.07:1, red 4.41:1).

Expected — note the real enum value is REJECTED, not DENIED:
- PENDING / UNDER_REVIEW:  Clock      text-amber-700  bg-amber-50   (warning)
- APPROVED:                Check      text-green-700  bg-green-50   (success)
- REJECTED:                X          text-red-700    bg-red-50     (danger)
- SUBMITTED:               Send       text-brand      bg-blue-50    (info)
- REVISION_REQUESTED:      RefreshCw  text-amber-700  bg-amber-50   (warning)

timesheetStatusTone() at StatusBadge.tsx:15 already maps every TimesheetStatus
to a BadgeTone. Attach the icon to the tone in the TONES map and bump the
shades to -700 in the same change. Do not branch on status at call sites.

Scope: frontend badges only.

Do not touch: approval logic, workflow state machine, permissions,
payrollStatusTone() label mapping.

Verify: (a) each status shows its icon and color, (b) contrast ≥4.5:1 for
every pair, (c) every feature rendering StatusBadge spot-checked — it is used
across timesheets, payslips and scrum, (d) typecheck + lint clean.
```

---

## BUG-AH-4 — Navigation Section Icon Colors

**Where:** `features/app-shell/components/SidebarNavItem.tsx`,
`SidebarNavSection.tsx`, `AppSidebar.tsx`, `AdminSidebar.tsx`, and
`apps/api/src/modules/navigation/navigation.service.ts`

```
Fix: sidebar icons are colored by active state only, so sections are not
visually distinguishable when scanning.

Expected — these are the REAL sections (navigation.service.ts:12), not
WORK/APPROVALS/HR/REPORTS/ADMIN/SUPPORT:
- WORKSPACE:        text-brand
- MANAGEMENT:       text-amber-700
- FINANCE_REPORTS:  text-cyan-700
- FINANCE:          text-green-700
- SYSTEM:           text-purple-700
- SUPPORT:          text-orange-700

Critical: sidebar icons are defined in TWO places. The API emits an icon
string; ICON_MAP at SidebarNavItem.tsx:34 resolves it to a component. There is
no fallback — an unmapped string renders NOTHING. If you change any icon name
in navigation.service.ts you must add the matching ICON_MAP entry.

Finance runs a separate shell with hardcoded nav — check features/finance/ for
a second nav to keep in sync.

Scope: sidebar rendering. Only touch navigation.service.ts if icon names change.

Do not touch: sidebar structure, routing, permission filtering.

Verify: (a) each section's icons carry its color, (b) the ACTIVE item is still
obviously active — section coloring competes with the active-state affordance;
if it no longer reads, keep active-state coloring and tint the section header
instead, (c) no nav item renders a blank icon, (d) collapsed sidebar and mobile
drawer both correct, (e) typecheck + lint clean.
```

---

## BUG-AH-5 — Action Button Icon Colors

**Where:** `components/shared/DataTable.tsx`, `components/ui/button.tsx`,
`components/shared/ConfirmationDialog.tsx`

```
Fix: action icons use inconsistent colors across tables, forms and modals.

Expected:
- EDIT:      Pencil             text-brand
- DELETE:    Trash2             text-red-700
- VIEW:      Eye                text-cyan-700
- DOWNLOAD:  Download           text-green-700
- UPLOAD:    Upload             text-brand
- ADD:       Plus               text-green-700
- SETTINGS:  SlidersHorizontal  text-purple-700
- CLOSE:     X                  text-brand-muted

Lucide has no Edit2 — use Pencil (or SquarePen).

Where an action icon sits inside a Button, the button VARIANT should own the
color, not the icon. Check the variant first; only color the icon where it is
standalone. Do not add a class that fights the variant's own foreground color.

Scope: frontend only.

Do not touch: click handlers, permissions, button variant structure.

Verify: (a) icons consistent across table rows, modals and card headers,
(b) destructive variant buttons unchanged, (c) hover/focus states still legible,
(d) every icon-only control has an aria-label, (e) typecheck + lint clean.
```

---

## BUG-AH-6 — Alert & Severity Icon Colors

**Where:** `components/shared/Toast.tsx` (primary),
`components/shared/ErrorState.tsx`, `components/shared/EmptyState.tsx`

```
Fix: Toast declares tone "success" | "error" | "info" but the render only
branches on isError — so INFO toasts render as SUCCESS, green check included.
There is no "warning" tone at all. This is a correctness bug, not just a color
inconsistency; fix the tone handling first, then the colors.

Expected:
- ERROR:    AlertCircle    text-red-700     bg-red-50
- WARNING:  AlertTriangle  text-amber-700   bg-amber-50
- INFO:     Info           text-cyan-700    bg-cyan-50
- SUCCESS:  CheckCircle2   text-green-700   bg-green-50

Replace the isError ternary with a tone→{icon, className} map and add
"warning" to the ToastState union. Toast currently renders solid-fill
(bg-red-600 / bg-brand-navy) with white text — keep that treatment and pick
per-tone solids, or move to tint+dark-text; do not mix the two.

There is no Alert.tsx or ValidationError.tsx. Inline validation is per-form —
find it with: grep -rn "text-red-" apps/web/features --include=*.tsx

Scope: frontend feedback components.

Do not touch: validation logic, message content, the notifications module.

Verify: (a) an info toast is visually distinct from success, (b) warning tone
renders, (c) contrast ≥4.5:1 against whatever background is chosen, (d) every
existing Toast call site still compiles — the union widened, so this is
additive, (e) typecheck + lint clean.
```

---

## BUG-AH-7 — Leave & Card Widget Icon Colors

**Where:** `features/leave/components/`, `features/supervisor-leave/components/`,
`components/shared/MetricCard.tsx`, `components/shared/StatCard.tsx`

```
Fix: leave type icons and dashboard widget cards use inconsistent or missing
colors.

Expected — LeaveType (prisma/schema.prisma:117) has exactly THREE values:
- ANNUAL:    Umbrella  text-green-700   bg-green-50
- SICK:      Activity  text-red-700     bg-red-50
- PERSONAL:  User      text-purple-700  bg-purple-50

SIL, MATERNITY, PATERNITY and BEREAVEMENT are NOT in the schema. Adding them
needs a Prisma migration plus Philippine statutory-leave accrual logic — that
is a feature, not an icon bug. Do not add them here.

Card widgets — pass via MetricCard's existing iconTone prop:
- Total Work Hours:  Clock         bg-blue-50 text-brand
- Break Hours:       Coffee        bg-orange-50 text-orange-700
- Days Logged:       CalendarDays  bg-green-50 text-green-700
- KPI Target:        Target        bg-purple-50 text-purple-700
- Pending Reviews:   Inbox         bg-amber-50 text-amber-700

Scope: frontend cards, widgets and leave type indicators.

Do not touch: leave logic, accrual calculation, widget data, the LeaveType enum.

Verify: (a) each leave type shows its icon and color, (b) no UI references a
leave type absent from the enum, (c) card tints readable in .dark, (d) mobile
at 375px, (e) typecheck + lint clean.
```

---

## BUG-AI — Notification Filter Navigation Uses Horizontal Scroll Instead of Dropdown

**Where:** Notifications section > Filter navigation bar (beside Sort dropdown)

```
Fix: filter categories (All, Unread, Archived, Daily Scrum, Timesheets,
Payroll, etc.) are laid out in a horizontal row with a horizontal
scrollbar. Users must scroll sideways to see hidden categories, creating
a clunky UX and hiding options from immediate view.

Expected: replace the horizontal-scroll row with a standard dropdown/
select menu labeled "Filter". This removes the need for horizontal
scrolling, cleans up the UI, and allows users to see all categories
at once.

Scope: frontend FilterBar component. Replace horizontal flex layout +
overflow-x-auto with a select/dropdown component.

Do not touch: notification list logic, sorting functionality, permission
filters.

Verify: (a) no horizontal scrollbar appears, (b) dropdown shows all filter
options visible at once (no truncation), (c) selecting a filter updates
notifications correctly, (d) active filter state persists, (e) Sort
dropdown still works alongside new Filter dropdown, (f) mobile responsive,
(g) no console errors.
```

---

## BUG-AJ — Auto-Generate Semi-Monthly Payroll Periods + Auto-Link Timesheets

**Where:** HR/Admin Payroll module > Payroll Period dropdown selector and timesheet submission workflow

```
Fix: manual payroll period creation (via "+ New Period" button) has led
to overlapping date ranges and inconsistent timesheet routing. The system
relies on HR admins to manually pull timesheets into periods, creating
human error and data chaos.

Expected: (1) remove or disable the manual "+ New Period" button, (2)
implement a cron job to automatically generate standardized semi-monthly
periods (1st-15th, 16th-EOM) rolling forward each month, (3) on timesheet
approval, automatically tag/route the timesheet to the correct system-
generated period based on work date, (4) HR should not manually assign
timesheets to periods.

Scope: backend (payroll-period.service.ts, cron job generator, timesheet
approval workflow), frontend (remove manual button, clean dropdown to
show auto-generated periods only), database (add is_auto_generated flag,
ensure period_id link on timesheets).

Do not touch: timesheet approval logic, payroll calculation.

Verify: (a) cron runs on 1st and 16th, generating two periods per month,
(b) periods are 1st-15th and 16th-last day with no overlaps, (c) on
timesheet approval, period_id auto-populates correctly, (d) manual period
creation disabled, (e) existing timesheets migrated to correct periods,
(f) no payroll is calculated twice for the same entry.
```

---

## BUG-AK — Add Payment Status Labels to Timesheet Entries (Paid/Unpaid/Processing)

**Where:** Timesheets module (Employee/Audit view) and Finance/Payroll modules

```
Fix: timesheet records lack a financial lifecycle indicator, risking
duplicate payroll processing. Once a payout is delivered, the timesheet
should be locked/marked as paid to prevent accidental re-processing.

Expected: every timesheet entry displays a prominent payment status badge
(Unpaid, Processing, or Paid). Once Finance marks a payroll batch as
paid, associated timesheets auto-update to Paid status. Payroll
generation engine automatically filters out Paid timesheets to prevent
duplicates.

Scope: database (add payment_status enum field to timesheets), frontend
(add status badge column to audit tables), backend (payroll generation
must exclude paid entries, mark entries as paid when batch is paid).

Do not touch: timesheet approval workflow, payroll calculation logic.

Verify: (a) new timesheets default to UNPAID, (b) payment status badge
visible in audit table, (c) after payroll payout, timesheets marked PAID,
(d) next payroll generation excludes paid timesheets, (e) duplicate
processing impossible, (f) no console errors.
```

---

## BUG-AL — Missing Feature: Dedicated Grievance/Complaint Submission Channel to HR

**Where:** Sidebar navigation (new HR Services section) and Admin dashboard

```
Fix: employees lack a secure, formalized, private channel to submit
workplace complaints or grievances to HR. Existing text fields (Blockers,
Notes) are task-related and visible to supervisors, making them
inappropriate for formal HR complaints.

Expected: (1) new "Submit a Complaint" form accessible to all employees
(Sidebar > HR Services or Support section), (2) form collects Subject,
Category (Workplace Environment, Colleague Issue, Payroll Dispute, etc.),
Description, optional Anonymous flag, (3) submissions routed to HR inbox
only (bypassing supervisor hierarchy), (4) employee can track status
(Submitted → Under Review → Resolved) without seeing internal HR notes,
(5) HR can add internal notes (hidden from employee) and mark resolved.

Scope: database (grievances table, activity log), backend (submission +
retrieval endpoints, HR-only permission checks), frontend (employee
submission form, status tracker, HR inbox + detail view).

Do not touch: supervisor leave management, performance reviews.

Verify: (a) employee can submit complaint anonymously, (b) complaint
routed to HR inbox only, (c) HR can add notes invisible to employee, (d)
employee sees status + resolution (when resolved), (e) RBAC: no cross-
complaints visible, (f) audit trail complete.
```

---

## BUG-AM — Implement DOLE-Mandated Leave Categories

**Where:** HR/Admin Module > Leave Management/Time Off Settings and Employee Leave Request forms

```
Fix: system uses generic "PTO" tracking, lacking support for specific
Philippine DOLE-mandated leave types with distinct accrual rules and
eligibility requirements.

Expected: system must support and configure:
- Service Incentive Leave (SIL): 5 days/year, vested after 1 year, unused
  balance converts to cash at year-end (mandatory)
- Vacation Leave: company policy (typically 10 days/year)
- Sick Leave: company policy (typically 10 days/year)
- Maternity Leave: DOLE minimum 60 days
- Paternity Leave: DOLE minimum 7 days
- Bereavement Leave: 3-5 days per policy
- Special Leave: marriage, medical, per policy

Scope: database (expand leave_types with DOLE category enum, accrual
rate, vesting period, carryover rules, cashability flag), frontend
(leave request form shows correct types + balances), backend (accrual
calculation enforces vesting, year-end SIL conversion).

Do not touch: existing leave request approval workflow.

Verify: (a) new employee: SIL balance = 0, (b) after 1 year: SIL balance
= 5 days, (c) employee requests 3 days SIL, approved → balance 2 days,
(d) year-end: 2 unused days convert to cash, (e) payroll includes cash
conversion, (f) maternity/paternity minimums enforced.
```

---

## BUG-AN — Missing Feature: Employees Can't Add Events to "My Schedule" Calendar

**Where:** Workspace > My Schedule module (Employee View)

```
Fix: the "My Schedule" calendar displays assigned shifts but is read-only
for employees. There's no way to add personal events, reminders, or leave
requests directly from the calendar.

Expected: (1) visible "[+ Add Event]" button or click-to-add on calendar
dates, (2) modal/form allows employee to input event title, type (reminder/
appointment/leave request), date, time, notes, (3) events persist and
appear alongside shifts on the calendar, (4) employee can edit/delete
own events.

Scope: database (employee_calendar_events table), frontend (Add Event
button + modal form, event rendering on calendar), backend (save/retrieve/
delete endpoints).

Do not touch: shift assignment display, supervisor view.

Verify: (a) [+ Add Event] button visible, (b) click date or button opens
form, (c) event saves and persists after page reload, (d) event appears
on calendar alongside shifts, (e) employee can edit/delete own events,
(f) mobile responsive.
```

---

## BUG-AO — "Weekly Tracked Hours" Chart Locked to Current Week Only (No History Navigation)

**Where:** Finance & Reports > Payroll (Payslips view) > "Weekly Tracked Hours" section

```
Fix: the "Weekly Tracked Hours" chart displays only the current week
with no way to view historical weeks. Users cannot review past work
patterns or performance.

Expected: add date navigation controls (e.g., "< Previous Week | [Week
of Aug 1-7] | Next Week >") or a date range picker that allows users to
view historical weekly data. Chart updates when navigating to a different
week.

Scope: frontend (add navigation UI to chart header, manage selected week
state, refetch data on date change), backend (ensure endpoint accepts
week start date parameter and returns aggregated data for that week).

Do not touch: chart rendering, payroll data.

Verify: (a) Previous Week button navigates back, (b) Next Week navigates
forward, (c) cannot navigate to future weeks, (d) chart data updates
correctly for selected week, (e) date range displayed clearly, (f)
mobile responsive.
```

---

## BUG-AP — Missing Form Validation on Work Details Submission

**Where:** Daily Scrum module > Work Details form (Save Work Details button)

```
Fix: the Work Details form allows users to save without filling required
fields. Users can leave Task, Work Category, and Deliverables empty and
still successfully save.

Expected: (1) mark required fields with asterisk (*), (2) show "This
field is required" error message on empty fields, (3) highlight empty
required fields in red, (4) disable Save button until all required fields
have input, (5) backend should also reject requests missing required data.

Scope: frontend (form validation logic, error state styling, button
disabled state), backend (payload validation on save endpoint).

Required fields:
- Task (mandatory)
- Work Category (mandatory)
- Work Description (mandatory)
- Deliverables (consider: optional or required?)

Do not touch: form data model, submission endpoint logic, permissions.

Verify: (a) leave Task empty → Save button disabled, (b) fill Task,
leave Category empty → Save still disabled, (c) fill all required fields
→ Save button enabled, (d) error messages appear on empty fields, (e)
backend rejects incomplete payloads with clear error, (f) mobile
responsive.
```

---

## BUG-AQ — Broken Edit Workflow for Daily Scrum History (Request, Unlock, Relock)

**Where:** Daily Scrum module > Daily Scrum History table (locked entries)

```
Fix: the workflow for revising past locked scrums is incomplete. (1)
Employees have no way to request unlock, (2) when supervisor unlocks, it
remains read-only, (3) no mechanism to re-lock after edits.

Expected: complete revision workflow:
1. EMPLOYEE requests unlock: "Request Unlock" button on locked rows →
   sends notification to supervisor
2. SUPERVISOR grants unlock: entry becomes fully editable for employee
3. EMPLOYEE edits: all fields (Commitments, Blockers, Work Details)
   become editable form inputs
4. EMPLOYEE resubmits: "Resubmit" button saves changes and auto-locks
   the entry immediately

Scope: frontend (add Request Unlock button to history rows, convert
locked view from read-only text to editable form, add Resubmit button),
backend (create unlock request/notification, fix permission flags so
unlocked = writable, auto-lock on resubmission).

Do not touch: scrum submission/approval workflow, permission hierarchy.

Verify: (a) locked entry shows "Request Unlock" button, (b) click
Request → supervisor gets notification, (c) supervisor unlocks → entry
becomes fully editable, (d) employee can edit all fields, (e) click
Resubmit → entry saves and locks, (f) verify audit trail of edits.
```

---

## BUG-AR — Supervisor Comments Can't Be Dismissed or Deleted

**Where:** Daily Scrum module > Right-side panel > "SUPERVISOR COMMENT" card

```
Fix: supervisor comments persist indefinitely on the dashboard with no
way to dismiss or delete them. Clutters active workspace after being
read/addressed.

Expected: (1) add dismiss/delete action (X icon or "Dismiss" link), (2)
for employees: "Dismiss" or "Mark as Read" hides comment from their
dashboard, (3) for supervisors (comment author): "Delete" option removes
it entirely, (4) dismissed/deleted comments don't render on active page.

Scope: frontend (add icon/button to card header, handle click to dismiss
or delete), backend (add dismissed/deleted flag to comments table, query
excludes dismissed comments unless explicitly viewing history).

Do not touch: supervisor comment creation, notification system, comment
display in history view.

Verify: (a) supervisor comment card shows X/dismiss button, (b) employee
clicks Dismiss → comment disappears from active dashboard, (c) comment
still visible in Daily Scrum History (past view), (d) supervisor can
click Delete → comment removed entirely, (e) page refreshes and comment
gone, (f) audit log records dismissal/deletion.
```

---

## Suggested order

Group by risk and independence — do standalone/low-risk items first, save anything touching payroll or RBAC for its own isolated session:

**Critical & High-Impact (Do First):**
1. BUG-AE (Shift Limit 13h → 12h — HIGH, blocks feature, quick fix)
2. BUG-AF (My Timesheet empty — CRITICAL, data visibility bug)
3. BUG-AG (Team Status privacy — MEDIUM, quick frontend fix)

**Icon Color System (Isolated, Visual Polish) — reordered 2026-08-05:**
4. BUG-AH-3 (Approval icons — MEDIUM, highest value; one file does most of it)
5. BUG-AH-6 (Alert icons — MEDIUM, contains a real `Toast` correctness bug)
6. BUG-AH-2 (Time/Clock icons — LOW, needs `StatCard.iconTone` added first)
7. BUG-AH-7 (Leave/Card icons — LOW; 3 leave types, not 6)
8. BUG-AH-5 (Action icons — LOW, mostly button variants)
9. BUG-AH-4 (Navigation icons — MEDIUM, most invasive: API + web must stay in sync)
10. BUG-AH-1 (Status icons — **BLOCKED**, attendance statuses don't exist yet)

**UX & Features:**
11. BUG-AI (Filter dropdown — LOW, UX improvement)

**Backend Features (Needs Planning & Testing):**
12. BUG-AJ (Auto payroll periods — HIGH, feature + backend job)
13. BUG-AK (Payment status labels — HIGH, prevents duplicates)
14. BUG-AL (Grievance channel — MEDIUM, new feature)
15. BUG-AM (DOLE leave types — HIGH, compliance)
16. BUG-AN (Calendar events — MEDIUM, feature)
17. BUG-AO (Weekly hours history — LOW, analytics)

**Notes on BUG-AH:**
- Six of the seven are actionable; **AH-1 is blocked** — `PRESENT`/`LATE`/`ABSENT`/`ON_LEAVE` do not exist in the schema, API, or web app. The unblocking step (adding icon support to `StatusBadge`) is folded into AH-3.
- **AH-7 depends on BUG-AM (DOLE leave types).** `LeaveType` currently has three values (`ANNUAL`/`SICK`/`PERSONAL`). SIL, maternity, paternity and bereavement icons cannot be added until BUG-AM lands the enum and accrual logic. Do AH-7 for the three existing types now; revisit after AM.
- The original "2–3 weeks" estimate assumed per-call-site find-and-replace across a directory structure that doesn't exist. Most of the value lands in four shared components — `StatusBadge`, `Toast`, `MetricCard`, `StatCard` — plus the sidebar. Scope is days, not weeks.

---

## Daily Scrum-Specific Bugs (High Priority - User Workflow)

18. BUG-AP (Missing form validation — blocks incomplete submissions)
19. BUG-AQ (Broken edit/unlock workflow — critical for scrum revisions)
20. BUG-AR (Can't dismiss supervisor comments — UX clutter)
21. BUG-AS ("Version mismatch" error blocks approval queue actions)

---

## BUG-AS — "Version Mismatch" Error Blocks Admin From Approving/Rejecting Applicants

**Where:** Admin Settings > Approval Queue (applicant approval/rejection actions)

```
Fix: attempting to approve or reject a pending applicant in the queue
fails with a "Version mismatch" error toast. The applicant remains stuck
in "Verification Pending" state and cannot be processed.

Expected: clicking "Approve" should authenticate the user, update their
status in the database, remove them from the pending queue, and display
a success notification. Same for "Reject".

Root cause: optimistic concurrency control (OCC) issue. Either:
(1) frontend is sending a stale version token/ETag (fetched once, never
    refreshed before action), or
(2) backend is incrementing/validating the version field incorrectly in
    the approval endpoint, rejecting legitimate requests.

Scope: frontend (AdminApprovalQueue.tsx, useApplicantData hook — ensure
latest version token is fetched before action), backend
(user.service.ts or admin.service.ts approval endpoint — review version
field handling, ensure it's incremented after success, validate correctly
before write).

Before editing: check the Network tab in browser DevTools while
attempting an approval. Inspect the request payload — does it include a
version/ETag field? If yes, is it fresh or stale? Then check the backend
endpoint to see how version is being validated.

Do not touch: user authentication flow, applicant onboarding steps,
email notifications, role/permission assignment.

Verify: (a) fetch latest applicant state before approval action, (b)
send correct version token in request payload, (c) backend increments
version after successful approval, (d) re-approving same applicant fails
with version mismatch (proves OCC is working), (e) clicking approve/
reject succeeds and removes from queue, (f) success notification displays,
(g) applicant role/status updated in user table, (h) `npm run test`
passes.
```

---

## BUG-AT — Feature Request: Ability to Create Custom Payroll Periods

**Where:** Finance & Reports > Payroll Processing module > Period selection bar

```
Fix: the Payroll Processing module lacks a UI control to generate new
custom payroll periods. HR/Finance can only process pre-existing or
auto-generated date ranges. This blocks off-cycle payrolls, final pay for
exiting employees, and mid-month adjustments outside the standard
schedule.

Expected: (1) prominent "+ New Period" or "Create Custom Period" button
next to "Select Payroll Period" dropdown, (2) clicking opens a modal with
date picker for start/end dates, (3) saved custom periods appear in the
dropdown, (4) admin selects custom period and proceeds through 7-step
workflow (01 PERIOD through 07 VALID) as normal.

Scope: frontend (add button + date-picker modal, refresh dropdown on save),
backend (POST /api/payroll-periods endpoint accepting start_date, end_date,
creating payroll_period record, returning it for immediate use).

Do not touch: existing period selection logic, payroll calculation engine,
approval/validation workflow, tax/SSS/PhilHealth deduction logic.

Verify: (a) "+ New Period" button visible next to dropdown, (b) click
opens date-picker modal, (c) enter start/end dates, save creates record,
(d) new period appears in dropdown, (e) selecting custom period populates
workflow with correct date range, (f) payroll calculation works for custom
period (spot-check: HOURS tab uses custom date range), (g) custom periods
persist after page reload, (h) cannot create period with end < start, (i)
`npm run test` passes.
```

---

## BUG-AU — Feature Request: Granular Per-Entry Hour Adjustments with Automatic "Rejected Hours" Tracking

**Where:** Timesheets > Review Panel > Pending Submissions > "LOGGED TASKS & OUTPUTS" section

```
Fix: timesheet supervisors can only adjust total aggregate hours via a
global "Adjust Hours" button. Individual time entries in the
"LOGGED TASKS & OUTPUTS" list are read-only. When hours are reduced,
the deducted time is lost instead of being tracked as rejected.

Expected: (1) inline edit icons on each logged task entry, (2) supervisor
clicks to adjust regular/overtime hours for that specific entry, (3)
system auto-calculates delta (submitted - approved), (4) delta is saved as
"Rejected Hours" on that entry and visible to employee, (5) employee can
see entry split into approved + rejected with supervisor's reason.

Scope: frontend (add inline edit controls to "LOGGED TASKS & OUTPUTS"
items, display "Rejected Hours" badge on adjusted entries), backend
(modify timesheet approval endpoint to accept granular per-entry
adjustments, add rejected_hours column to time_entries table or separate
rejection record, calculate delta and persist).

Do not touch: global "Adjust Hours" button (keep as safety valve for bulk
adjustments), timesheet submission workflow, payroll deduction logic.

Verify: (a) edit icon visible on each logged task, (b) click opens inline
editor for regular/OT hours, (c) supervisor reduces entry from 12h to 8h,
saves, (d) system calculates 4h as rejected, (e) database stores
submitted_hours=12, approved_hours=8, rejected_hours=4, (f) employee
views timesheet and sees entry split (8h approved, 4h rejected), (g)
supervisor can optionally add reason/note for rejection, (e) audit trail
logs the adjustment + reason, (f) rejected hours excluded from payroll
total, (g) `npm run test` passes.
```

---

## BUG-AV — UX Improvement: Automate Task Mapping from Daily Scrum and Lock Department Field

**Where:** Timesheet submission > Work Details form

```
Fix: the Work Details form introduces unnecessary friction by requiring
users to manually confirm department and re-enter tasks already defined
in their Daily Scrum.

Current state: (1) Department is an editable text input (risks typos,
visual clutter), (2) "FROM TODAY'S COMMITMENTS" chips copy text into a
free-text box (redundant, breaks data link, saves string not reference).

Expected: (1) Department displayed as read-only badge ("Logged under:
Engineering") pulled from user profile at submission, (2) Daily Scrum
"Today's Commitments" tasks pre-populated as a checklist — user checks
boxes to attach, no re-typing, (3) "Add Unplanned Task" button for
exceptions that don't appear in scrum.

Scope: frontend (convert Department to read-only badge, replace free-text
task input with scrum_commitment checklist + "Add Unplanned" button),
backend (pull department_id from user session, update timesheet schema
to link scrum_commitment_ids instead of free strings, accept both linked
commitments + unplanned tasks).

Do not touch: Daily Scrum creation/editing, task description text,
timesheet approval workflow.

Verify: (a) Department displays as badge, not input, (b) user's profile
department matches badge, (c) scrum commitments auto-populate on form
load, (d) user checks box to attach commitment, (e) "Add Unplanned Task"
opens inline form for exceptional work, (f) form submission includes
both linked scrum_commitment_ids + unplanned tasks array, (g) database
stores referential links, not copied strings, (h) timesheet audit shows
which entries came from scrum vs manual add, (i) cross-department billing
(if needed) hidden behind toggle, (j) `npm run test` passes.
```

---

## BUG-AW — Feature Request: Daily Rate Basis in Addition to Hourly

**Where:** Admin Settings > Compensation / Employee Profile > Rate Configuration

```
Fix: the system currently supports only hourly rate basis for employees.
For roles that are compensated on a daily rate (e.g., contractors, some
consultants, or positions with fixed daily allowances), there is no way
to configure or calculate pay.

Expected: (1) Admin can set compensation type per employee: Hourly or
Daily, (2) if Daily, admin enters daily_rate (₱ amount) and optionally
days_per_week (default 5), (3) timesheet/payroll calculates daily pay
as: days_worked × daily_rate (with proportional deductions for partial
days), (4) payroll reports show daily-basis breakout separately from
hourly, (5) employee profile displays compensation basis clearly.

Scope: database (add compensation_type enum [HOURLY, DAILY] to
employee_compensation or extend rate configuration, add daily_rate and
days_per_week fields), frontend (Admin > Employee Compensation form with
toggle between Hourly/Daily, conditional fields for each type), backend
(payroll calculation engine: if DAILY, use days_worked; if HOURLY, use
hours_worked; apply statutory rates/deductions accordingly).

Do not touch: timesheet submission (hours/minutes still tracked), leave
accrual logic (based on days or hours per policy), tax/SSS/PhilHealth
calculation (adjust based on daily vs hourly, but formulas stay).

Verify: (a) Admin can toggle employee compensation type, (b) Daily type
shows daily_rate + days_per_week inputs, (c) Hourly type shows hourly
rate input, (d) employee works 4.5 days, daily_rate ₱2,000 → calculates
as ₱9,000 gross, (e) partial day (e.g., 0.5 day) prorated correctly, (f)
payroll report segregates daily vs hourly employees, (g) statutory
deductions (SSS/PhilHealth) apply to daily basis, (h) `npm run test`
passes.
```

---

## BUG-AX — Feature Request: Automate Semi-Monthly Payroll Periods and Timesheet Linking

**Where:** Admin > Payroll Period Management

```
Fix: system relies on manual creation of payroll periods, resulting in
overlapping, inconsistent date ranges (e.g., "Jul 1 - Jul 31", "Jul 14 -
Jul 31", "Jul 15 - Jul 17"). Timesheets don't automatically sync to
standardized company pay cycles.

Expected: (1) remove or restrict manual "+ New Period" button, (2)
automatically generate standardized semi-monthly periods (1st-15th, 16th-
EOM) rolling forward, (3) when employee tracks time and supervisor
approves, system auto-routes timesheet to correct system-generated
period based on work dates (no manual pulling), (4) cleanup dropdown to
show only standardized periods.

Scope: frontend (remove manual button, clean dropdown), backend (cron/
logic to auto-generate semi-monthly periods, update timesheet submission
/approval workflow to auto-tag period_id based on work date).

Do not touch: custom period creation for off-cycle payroll (if needed,
gate behind admin flag separately).

Verify: (a) system generates periods 1st-15th, 16th-EOM automatically,
(b) new period appears in dropdown on 16th and 1st of month, (c)
timesheet dated Jul 8 auto-routed to Jul 1-15 period, (d) timesheet
dated Jul 20 auto-routed to Jul 16-31 period, (e) manual period dropdown
hidden or read-only, (f) no overlapping periods exist, (g) `npm run
test` passes.
```

---

## BUG-AY — Feature Request: Add Payment Status Labels ("Paid" / "Unpaid") to Timesheet Entries

**Where:** Timesheets module (Employee/Audit view) and Finance/Payroll

```
Fix: timesheet records lack a financial lifecycle indicator. They show
approval status (e.g., "Overtime", "Unassigned") but not payment status,
creating risk of duplicate payroll processing.

Expected: (1) every timesheet entry displays payment status badge:
Unpaid, Processing, Paid, (2) once Finance marks payroll batch as paid/
disbursed, system auto-updates associated timesheet entries to Paid, (3)
payroll generation validates and excludes any timesheets marked Paid
(prevents re-submission).

Scope: database (add payment_status enum to timesheet_entries), frontend
(add status column/badge to audit tables), backend (implement validation
in payroll calculation to filter Paid entries, add auto-update logic
when payroll is marked complete).

Do not touch: timesheet approval workflow, payroll calculation formulas.

Verify: (a) timesheet displays status: Unpaid (default), (b) Finance
processes payroll batch, (c) status auto-updates to Processing, then
Paid, (d) Paid entries excluded from next payroll run, (e) payroll
report shows payment status breakdown, (f) no duplicate processing
possible, (g) `npm run test` passes.
```

---

## BUG-AZ — Feature Request: Add Philippine Statutory IDs ("201 File") and Contribution Exporters

**Where:** HR/Admin > Employee Profiles and HR Reports/Exports

```
Fix: system lacks fields for mandatory Philippine government IDs and
cannot generate/export required contribution reports.

Expected: (1) Employee Profile includes dedicated fields for TIN (Tax
Identification Number), SSS Number, PhilHealth Number, Pag-IBIG (HDMF)
Number, (2) system auto-calculates and exports monthly deduction reports
in formats required by SSS, PhilHealth, Pag-IBIG portals, (3) HR
dashboard has "Generate Government Reports" feature.

Scope: database (add statutory_id columns: tin, sss_number,
philhealth_number, pagibig_number to employee table), frontend (update
Employee Profile form with validated input fields, build export
dashboard), backend (implement data aggregation endpoints that format
payroll deductions into government-mandated export CSV/Excel files).

Do not touch: payroll deduction calculation (use existing rates).

Verify: (a) Employee Profile shows TIN field with validation, (b) SSS/
PhilHealth/Pag-IBIG fields appear with proper digit masks, (c) HR can
generate monthly SSS deduction export, (d) PhilHealth export matches
portal format, (e) Pag-IBIG export includes correct contribution
amounts, (f) all exports are CSV/Excel downloadable, (g) `npm run test`
passes.
```

---

## BUG-BA — Feature Request: Automate Philippine Time & Attendance Premiums (NSD, Holidays, Rest Days)

**Where:** HR/Admin > Holiday Calendar and Timesheets/Payroll calculation engine

```
Fix: system tracks standard hours but doesn't auto-apply Philippine
labor-mandated premiums for night shifts, holidays, rest days.

Expected: (1) system auto-flags hours 10 PM - 6 AM and applies 10%
Night Shift Differential, (2) HR has Holiday Calendar to set/categorize
holidays, timesheet engine auto-applies correct premium: Regular Holidays
(100%), Special Non-Working Holidays (30%), (3) system auto-flags work
on employee's scheduled day off and applies 30% Rest Day premium.

Scope: frontend (Holiday Calendar management UI, breakdown regular vs
premium hours on timesheet audit + payslip), backend (add logic to
cross-ref timestamp vs 10PM-6AM window, holiday DB, employee schedule;
apply correct % multipliers).

Do not touch: base hourly rate, SSS/PhilHealth deductions.

Verify: (a) 11 PM - 6 AM work auto-tagged NSD, (b) NSD shows 10%
multiplier on payslip, (c) HR can add Regular Holiday to calendar, (d)
work on Regular Holiday auto-applies 100% premium, (e) work on Special
Non-Working Holiday applies 30%, (f) rest day work applies 30%, (g)
timesheet audit breaks down regular vs NSD vs Holiday vs Rest Day hours,
(h) payslip shows each category separately, (i) `npm run test` passes.
```

---

## BUG-BB — Feature Request: Implement Employee Relations & Discipline Workflows (NTE and Clearance Trackers)

**Where:** HR/Admin > Employee Relations (new section)

```
Fix: system lacks formal discipline and offboarding tracking, creating
DOLE compliance risks.

Expected: (1) NTE (Notice to Explain) Generator: HR generates
disciplinary memo, employee submits written explanation via system (Twin-
Notice Rule compliance), (2) Grievance Inbox: secure HR dashboard for
employee complaints, (3) Clearance Tracker: digital workflow for exiting
employees routing approvals to IT (laptop), Finance (cash advances),
etc., blocking final pay until Clearance = Completed.

Scope: database (new tables: discipline_records [nte, response], grievances,
clearance_checklist_items), frontend (NTE form for HR, response UI for
employees, clearance routing checklist), backend (workflow logic
preventing final payroll if clearance incomplete, notification routing).

Do not touch: timesheet approval, payroll deduction.

Verify: (a) HR generates NTE with violation description, (b) employee
receives notification + can submit response, (c) audit logs both NTE and
response, (d) Grievance Inbox restricted to HR role only, (e) exiting
employee marked with Clearance status, (f) IT/Finance approvals route
correctly, (g) final payroll generation blocked until Clearance =
Completed, (h) `npm run test` passes.
```

---

## BUG-BC — Feature Request: Add 13th-Month Pay and De Minimis Benefits Trackers

**Where:** HR/Admin and Finance/Payroll > Compensation & Benefits

```
Fix: system lacks YTD basic salary tracking for 13th-month pay and
doesn't track non-taxable allowances per BIR limits.

Expected: (1) 13th-Month Pay Tracker auto-aggregates Jan 1 - Dec 31
basic salary, (2) De Minimis Benefits Tracker: HR assigns non-taxable
allowances (rice subsidy, clothing, medical) with BIR-approved caps, (3)
payroll generation respects De Minimis limits, separates from taxable
income.

Scope: database (add ytu_basic_salary_13th_month field, de_minimis_benefits
table with allowance type + amount + bir_cap), frontend (HR Compensation
dashboard for assigning benefits, Employee Payslip shows De Minimis
separately), backend (YTD aggregator for 13th month, validation logic to
cap De Minimis before tax calculation).

Do not touch: base tax/SSS/PhilHealth formulas, monthly payroll.

Verify: (a) YTD tracker shows Jan 1 - Dec 31 basic salary aggregate, (b)
Dec payroll calculates 13th-month = YTD/12, (c) HR can assign rice
subsidy ₱1,500/month, (d) system caps at BIR limit (₱1,500), (e) De
Minimis doesn't count as taxable income, (f) payslip shows De Minimis
line-item separately, (g) multiple De Minimis benefits can be assigned,
(h) `npm run test` passes.
```

---

## BUG-BD — Bug: Massive Discrepancy in "Total Tracked" Time (800+ hours for single day)

**Where:** Daily Scrum > End of Day Review > "Today's summary" panel

```
Fix: TOTAL TRACKED card displays impossibly high value (814h 37m) for a
single day, but actual timesheet for that day is only 4 minutes. Severe
calculation or data-fetching bug.

Expected: TOTAL TRACKED must reflect sum of timesheet entries for that
specific 24-hour period only (in this case: ~0h 04m).

Root causes to investigate: (1) missing date filter — query summing
lifetime hours instead of filtering by date = today, (2) timestamp math
error — missing clock-out time, timezone offset bug, or Unix epoch
millisecond conversion, (3) frontend not validating impossible values.

Scope: backend (fix aggregation query in daily summary endpoint), frontend
(add sanity check: if total > 24h, flag as error state instead of
rendering).

Do not touch: timesheet submission, clock in/out endpoints.

Verify: (a) create timesheet entry: clock in 08:00, clock out 08:04 (4m),
(b) daily summary TOTAL TRACKED shows ~0h 04m (not 800+ hours), (c) test
with timezone offsets to ensure UTC vs local time correct, (d) manual
clock-out (if exists) doesn't cause math error, (e) frontend shows error
badge if total ever exceeds 24h, (f) `npm run test` passes.
```

---

## BUG-BE — Bug: Payroll Records Visible and Actionable in Finance Before HR Submission

**Where:** Finance workspace > Payroll Processing > Payroll Table

```
Fix: Finance users can view and process payroll calculations for a period
before HR has finalized timesheet validation and officially submitted to
Finance. Breaks HR-to-Finance workflow gate.

Expected: (1) payroll period gated under HR control until HR explicitly
audits and clicks "Submit to Finance", (2) Finance sees locked/pending
state ("Pending HR Submission — HR is currently reviewing"), no
calculations/actions, (3) database enforces state lifecycle: HR_DRAFT →
SUBMITTED_TO_FINANCE → FINANCE_PROCESSING → FINALIZED.

Scope: frontend (conditionally render Payroll Table based on period
lifecycle; show "Waiting for HR submission" placeholder if HR_DRAFT),
backend (update /api/payroll/processing and /api/payroll/recalculate
endpoints to verify status is SUBMITTED_TO_FINANCE before returning data
or executing calculations for Finance role).

Do not touch: HR timesheet approval workflow, payroll calculation formulas.

Verify: (a) period in HR_DRAFT state, Finance views "Pending HR
submission" placeholder (no calculations visible), (b) HR marks period
"Submit to Finance", (c) Finance now sees live Payroll Table with
calculations, (d) /api/payroll/processing returns 403 if Finance tries
to access HR_DRAFT period, (e) state transitions logged in audit trail,
(f) `npm run test` passes.
```

---

## BUG-BF — UI Bug: "Individual KPI Progress" Chart X-Axis Overflows Container

**Where:** Performance Reports > KPI Dashboard > "Individual KPI Progress" panel

```
Fix: chart X-axis overflows right border of card, labels overlap and
become unreadable, layout breaks with large employee datasets.

Expected: (1) chart strictly constrained within card borders (max-width:
100%, overflow: hidden), (2) handle large datasets by rotating X-axis
labels -45°, enabling horizontal scroll, OR adding pagination/filtering
controls.

Scope: frontend (configure chart library options [Chart.js/Recharts/
ApexCharts] for label rotation, tick spacing, auto-skip; wrap canvas in
responsive container with overflow handling).

Do not touch: chart data aggregation, KPI calculation logic.

Verify: (a) chart with 20+ employees displays without overflow, (b) X-
axis labels rotated or scroll-enabled, (c) all labels readable (not
overlapping), (d) "MEMBERS BELOW TARGET" panel not displaced, (e) mobile
responsive, (f) no console layout errors.
```

---

## BUG-BG — Bug: Clicking Edit Icon on Timesheet Entries Causes React Crash (Error #310)

**Where:** Timesheets > Oversight & Approvals > Review Panel > "LOGGED TASKS & OUTPUTS"

```
Fix: clicking pencil (edit) icon on individual task entry causes full
application crash with "Minified React error #310" (Hook order violation).

Expected: clicking edit icon opens inline editor or modal to adjust hours
for that task, without crashing.

Root cause: React Hook rule violation — likely a Hook (useState/useEffect)
conditionally called or placed inside loop during edit state render,
causing "Rendered more hooks than during previous render".

Scope: frontend (debug component rendering lifecycle in task edit state,
ensure all Hooks called consistently at top level, implement localized
Error Boundary around tasks list to prevent full-page crash).

Do not touch: task data structure, approval workflow.

Verify: (a) click edit icon on task entry, (b) edit form/modal opens
smoothly, (c) no React errors in console, (d) adjust hours and save, (e)
entry updates in list, (f) Error Boundary catches any remaining Hook
errors with graceful fallback UI instead of full crash, (g) `npm run
test` passes (add regression test for Hook usage in task edit component).
```
