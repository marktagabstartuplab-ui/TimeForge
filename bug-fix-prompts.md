# TimeForge Bug Fix Prompts — Chunked

Source: `TimeForge (1).docx` (14 defects, BUG-A–BUG-N) plus follow-up QA batches (BUG-O–BUG-S) plus runtime errors, state issues, and missing features found during manual testing (BUG-T–BUG-AD) — untitled/unnumbered in source, numbered here for tracking.

**How to use this:** Run one at a time, in a fresh session or clearly separated turn, in the suggested order below. Never batch multiple prompts into one request — that's what causes fixing one bug to silently break another. Each prompt has a hard scope boundary, a "do not touch" list, and its own verification checklist.

---

## Shared rules (paste once per session, or keep in CLAUDE.md — already partially covered by the repo's Bug-fix workflow section)

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

## BUG-A — Timesheet rows don't link to Timesheet Entry Audit

**Where:** Employee Timesheets (daily summary table)

```
Fix: Timesheet table rows (Date, Time In, Time Out, Work Hours, Break
Time, Total) are static — clicking a row does nothing. There's no way
to reach the Timesheet Entry Audit for that day's detailed tasks and
deliverables.

Expected: each row is clickable and routes to that day's Timesheet
Entry Audit. Additionally, when a supervisor requests a revision, the
employee should be able to edit work details (project/task, description,
deliverables) inside the audit, while Start/End time and Duration stay
permanently locked.

Scope: frontend row click handler + routing to the audit view, and
conditional field-locking in the audit form based on timesheet status.

Note: this overlaps with the "Revision Requested" edit-unlock behavior
that may already exist elsewhere in the codebase (check
time-tracking module first) — if an edit-unlock mechanism already
exists, wire the new row-click route into it rather than building a
second one.

Do not touch: timesheet approval/rejection logic, payroll sync.

Verify: (a) clicking any row opens the correct day's audit, (b) audit
still opens correctly when reached via any other existing entry point,
(c) Start/End/Duration remain read-only in the audit regardless of
status, (d) edit only becomes available when status is "Revision
Requested".
```

---

## BUG-B — Role doesn't update to Supervisor on department assignment

**Where:** Department Directory (Assign Supervisor modal), User Profile Dropdown

```
Fix: Assigning a user as a department's supervisor via the Assign
Supervisor modal does not change their system role — their profile
badge still shows "Employee" and they can't access supervisor pages.

Expected: assigning a user as department supervisor elevates their
system role/permissions to Supervisor (or appends it as a secondary
role), the profile badge updates immediately, and supervisor routes
become accessible.

Scope: the Assign Supervisor mutation (backend — likely in
organization.service.ts or wherever department assignment lives),
whatever sets/reads the user's role for RBAC, and the frontend badge/
nav-guard that reads role.

Do not touch: other RBAC checks unrelated to this assignment flow, or
how existing supervisors already assigned were set (don't run a bulk
backfill unless asked).

Verify: (a) assigning a fresh employee as supervisor updates their role
immediately without re-login, (b) they can now access supervisor
dashboard/routes, (c) removing them as supervisor (if that flow exists)
is checked too — does the role correctly revert, or is that out of
scope? State which you handled, (d) existing employee-role users
unaffected.
```

---

## BUG-C — Supervisors missing from Admin Employee Directory and filters

**Where:** Admin → Employee Directory ("All Users" tab)

```
Fix: The "All Users" table only returns EMPLOYEE and ADMIN roles —
Supervisors are excluded entirely, and the Role filter dropdown doesn't
even list "Supervisor" as an option.

Expected: "All Users" returns every active account regardless of role,
including Supervisor, and the Role filter dropdown includes
"Supervisor" as a selectable value.

Scope: the backend query/endpoint powering the Employee Directory list
(check for a hardcoded role filter — likely an `in: [...]` list missing
SUPERVISOR), and the frontend dropdown's option source (likely also
hardcoded rather than derived from the role enum).

Do not touch: role-based page access/RBAC guards elsewhere — this bug
is specifically about the directory list query being incomplete, not
about permissions.

Verify: (a) directory now shows supervisors alongside employees/admins,
(b) filtering by "Supervisor" returns only supervisors, (c) filtering by
"Employee" or "Admin" still returns the same results as before (no
regression from the query change), (d) pagination/counts on the
directory page are still correct with the larger result set.
```

---

## BUG-D — Duplicate user records allowed with same email

**Where:** Admin → Employees (Employee Directory)

```
Fix: Two separate user rows exist with the identical email address
(shangealone17@gmail.com) — the system isn't enforcing email
uniqueness.

Expected: email addresses are enforced unique at the database level.
Same first/last name is fine; same email is not. Directory shows one
row per email.

Scope: (1) add a unique constraint/index on the email column via a
Prisma migration, (2) registration/invitation validation to reject a
duplicate email with a clear error before hitting the DB constraint,
(3) — separately — decide what to do with the EXISTING duplicate
records found in QA: do not silently delete/merge user data. Flag the
specific duplicate pair to the user/admin for manual review before any
merge, since merging could affect linked timesheets/payroll history.

Do not touch: any other uniqueness assumptions (e.g. username) unless
also broken — stay scoped to email.

Verify: (a) migration applies cleanly against current data — if it
fails because the existing duplicate rows violate the new unique
constraint, STOP and report that back rather than force-deleting rows,
(b) attempting to create/invite a user with an already-used email is
rejected with a clear message, (c) case sensitivity — confirm whether
"User@x.com" and "user@x.com" should collide (likely yes) and handle
accordingly.
```

---

## BUG-E — Admin/HR/Finance profile modal shows irrelevant employee fields

**Where:** Employee Profile modal, viewing Admin/HR/Finance accounts

```
Fix: The profile modal uses one generic template for every role, so
viewing an Admin's profile still shows "Department," "Supervisor," and
"Hourly Rate (PHP)" fields that don't apply to that role.

Expected: the modal renders fields conditionally based on the viewed
user's role. Admin/HR/Finance should not see Department/Supervisor/
Hourly Rate unless those roles are later given role-appropriate fields
of their own (out of scope here — just hide what doesn't apply for now
unless told otherwise).

Scope: frontend conditional rendering in the profile modal component
only, driven by the viewed user's role field (already available via
RBAC data).

Do not touch: the underlying user data model — Admin/HR/Finance
accounts may still legitimately have null Department/Supervisor/Rate
values in the DB; this is purely a display fix.

Verify: (a) viewing an Employee profile still shows all fields exactly
as before, (b) viewing Admin/HR/Finance hides the 3 listed fields, (c)
no layout breakage (empty gaps, broken grid) when fields are hidden —
check the modal renders cleanly for each role.
```

---

## BUG-F — "Department Head" should read "Department Supervisor"

**Where:** Admin → Departments (Edit Department modal)

```
Fix: copy-only. The Edit Department modal labels the leader-assignment
dropdown "Department Head (optional)" and its subtitle says "...reassign
its manager." — inconsistent with the rest of the platform's
"Supervisor" terminology.

Expected: label changes to "Department Supervisor" (keep "(optional)"
if that reflects actual behavior — confirm the field is genuinely
optional before keeping that qualifier), and the subtitle changes to
"...reassign its supervisor."

Scope: text-only changes in the Edit Department modal component. No
logic, no props, no data changes.

Do not touch: any other modal/screen — do a repo-wide check for other
"Department Head" or "manager" strings referring to this same concept
and list them, but only change this one modal unless asked to fix all
occurrences in this same pass (recommend doing a follow-up terminology
pass separately rather than scope-creeping this fix).

Verify: modal renders the new copy correctly, no truncation/overflow
from the longer string "Department Supervisor" vs "Department Head".
```

---

## BUG-G — Active Payruns table lacks unique identifiers

**Where:** Admin → Finance & Reports → Payroll (Active Payruns table)

```
Fix: rows are hard to distinguish when multiple departments share the
same pay period — only Pay Period, Department/Entity, Gross Total,
Status, and Actions are shown.

Expected: add a Payrun ID/Batch Number column and an Employee Count
column (e.g. "12 Employees").

Scope: backend — expose a batch identifier (create one if the payrun
generation process doesn't already assign one) and an employee count
in the payrun list API response. Frontend — add the two columns to the
table.

Do not touch: payroll calculation logic, approval workflow, or how
individual payrun batches are generated — this is additive
(new identifying columns), not a change to what a payrun contains.

Verify: (a) every existing payrun row displays a stable, unique batch
ID (not regenerated on every page load), (b) employee count matches
the actual number of employees included in that batch, (c) sorting/
filtering the table (if it exists) still works with the new columns.
```

---

## BUG-H — HR role lacks access to Attendance Reports

**Where:** Navigation Sidebar (Finance & Reports section) / Role Access

```
Fix: Attendance Reports is visible to Admin but not accessible to HR —
either missing from HR's sidebar or blocked by a permissions check.

Expected: HR role gets view + export access to Attendance Reports
(Days Logged, Absences, Tardiness, Attendance %).

Scope: RBAC permission grant for HR on this specific module
(packages/shared/src/permissions.ts and wherever the permission is
checked — @RequirePermissions guard on the backend route, and the
sidebar nav catalog in navigation.service.ts that decides visibility).

Do not touch: HR's access to any other module — grant only this one
permission, don't broaden HR's role generally.

Verify: (a) HR user now sees Attendance Reports in the sidebar, (b) HR
can open it and see data (not just see the nav item), (c) HR can export
if export exists for Admin, (d) no other role's Attendance Reports
access changed, (e) an HR user still cannot access modules they
shouldn't (spot check one other Admin-only module to confirm you didn't
accidentally widen HR's permission set).
```

---

## BUG-I — Redundant "Productivity Report" button in Admin Reports header

**Where:** Finance & Reports → Reports (Administrative Reports page header)

```
Fix: "Productivity Report" exists as both a header toggle button on the
Admin Reports page AND a separate item in the main sidebar — redundant.

Expected: pick one. Default to removing the header button since
Productivity Report already has its own sidebar entry (unless the user
tells you sidebar and header are meant to serve different purposes —
ask if unclear rather than assuming).

Scope: frontend only — remove the redundant header toggle button
component/route reference. Do not remove the sidebar item.

Do not touch: the Productivity Report page/data itself, or the "Admin
Reports" toggle that presumably stays.

Verify: (a) sidebar Productivity Report still works and is unaffected,
(b) Admin Reports header no longer shows the duplicate button, (c) no
dead route or broken link left behind from the removed button.
```

---

## BUG-J — Missing icon for "Security Logs" in sidebar

**Where:** Main Navigation Sidebar (System section)

```
Fix: "Security Logs" has no icon while "System Logs," "AI Settings,"
and "KPI Management" all have matching outline-style icons — visual
inconsistency/misalignment.

Expected: add a matching outline icon (shield or lock suggested) for
Security Logs.

Scope: frontend only — the sidebar nav icon mapping (navigation.service.ts
or wherever icon-per-nav-item is defined) and the icon set already in
use (match the existing icon library/style, don't introduce a new icon
package for one icon).

Do not touch: any other nav item's icon or ordering.

Verify: icon renders at the same size/alignment as sibling items in the
System section, no layout shift to other items.
```

---

## BUG-K — Employee can't edit "Planned Target" for selected KPI

**Where:** Employee Daily Scrum / Plan Commitment Task form

```
Fix: selecting a KPI Indicator auto-populates Planned Target (e.g. "12")
but the field is locked — it's showing the Admin's master/total target,
not letting the employee set their own daily commitment.

Expected: three distinct values need to exist and be tracked
separately:
  1. Admin's master Total Target (already exists, set in KPI Management)
  2. Employee's Planned Target for today — must be an EDITABLE input,
     pre-filled as a suggestion but changeable
  3. Employee's Actual Completed value at End of Day — a separate input
     that doesn't currently exist and needs to be added

Scope: (1) remove readonly/disabled from the Planned Target input,
(2) backend/schema change to store planned-target-per-day as its own
field distinct from the KPI's master target (check if this field
already exists as read-only-derived vs needs a new column — migration
likely required), (3) add the EOD "Actual Completed" input and its
storage field.

This is related to, but distinct from, the general KPI Metric ↔ Daily
Scrum integration work — if that integration is already built or in
progress elsewhere, confirm this fix aligns with that data model rather
than creating a second, conflicting way of storing KPI target data.

Do not touch: the Admin KPI Management master target definition itself
— that value should remain the ceiling/reference, not be edited from
here.

Verify: (a) employee can now type a custom planned target different
from the master target, (b) an EOD actual-completed input exists and
saves, (c) achievement % (if calculated anywhere) now compares actual
vs PLANNED target, not master target — confirm which comparison is
correct with the user if ambiguous, (d) existing scrum entries without
a planned-target value don't break when rendered.
```

---

## BUG-L — No way to view all KPI Performance Scorecards

**Where:** KPI Performance Scorecard section

```
Fix: only a single scorecard for one role is shown, with no dropdown,
pagination, or "View All" to browse other roles/employees/departments.

Expected: add a way to browse all active scorecards — a filter dropdown
to switch between roles/employees, or a dedicated aggregated list/
dashboard view.

Scope: backend — an endpoint returning an aggregated list of scorecards
scoped to the requesting user's access level (Admin sees all, Supervisor
sees their department, etc. — confirm the correct scoping rule against
existing RBAC patterns in the codebase rather than inventing one).
Frontend — add the selector/list UI.

Do not touch: how an individual scorecard is calculated/rendered — this
is about discovery/navigation between existing scorecards, not the
scorecard content itself.

Verify: (a) an Admin can browse all scorecards, (b) a Supervisor only
sees scorecards within their scoping rule (not everyone's), (c) the
originally-working single-scorecard view still works when accessed
directly.
```

---

## BUG-M — Supervisor incorrectly listed among their own team's underperforming members

**Where:** Management Workspace → KPI Dashboard → Identify Underperforming Members

```
Fix: the supervisor's own account shows up in the list of underperforming
team members for their own department, mislabeled with role "Employee".

Expected: the query backing this table should exclude the department's
supervisor entirely — this view is for management oversight of direct
reports, not the supervisor themselves.

Scope: backend query filtering this specific table — exclude the
logged-in supervisor's user ID (or filter out SUPERVISOR role) from the
underperforming-members query.

Do not touch: role badges elsewhere in the system, or other KPI
dashboard tables/widgets — confirm this exclusion is needed only in
this specific "Identify Underperforming Members" query, not applied
globally to every team-member list (some other view may legitimately
want to include the supervisor).

Verify: (a) the supervisor no longer appears in their own
underperforming-members list, (b) all their actual direct reports still
appear correctly, (c) check one other team-member-listing view (if any
exists) to confirm you didn't accidentally apply this exclusion there
too when it wasn't asked for.
```

---

## BUG-N — No way for an employee to signal return from active leave

**Where:** Leave Management / Employee Dashboard

```
Fix: once an employee's leave is active, there's no button/flow for them
to end it early or confirm return — status stays stuck, and the
supervisor's "Active Leave" counter never decrements from the employee
side.

Expected: employee on active leave gets a "Return to Work" / "End Leave"
action. On click:
  1. their availability status updates to Active/Working
  2. supervisor's "Active Leave" counter decrements
  3. a notification fires to supervisor + HR confirming the return

Scope: frontend — a state-dependent action button shown only while
status is "Active Leave". Backend — the state transition (leave record
update, user availability status update) and hooking into the existing
notification system (repo already has an AuditLog+Notification pattern
for mutating actions on payroll/HR/AI — follow that same pattern here
rather than building a new notification path).

Do not touch: leave request/approval creation flow (the "start leave"
side) — this is only about ending an already-active leave.

Verify: (a) clicking Return to Work updates the employee's own status
immediately, (b) the supervisor's dashboard counter reflects the change
without needing a manual refresh (or on next load if realtime isn't in
scope — confirm which), (c) supervisor and HR both receive the
notification, (d) an employee NOT currently on leave never sees this
button.
```

---

## BUG-O — Missing "Actual Completed" input in End of Day Review

**Where:** End of Day Review modal (Today's Commitments section)

```
Fix: EOD Review only shows a static "Completed" badge per task. Since
task planning already captures a numerical Planned Target, the review
step needs a matching numerical input to record what was actually
delivered — right now completion is effectively a binary flag.

Expected: for each KPI-linked commitment, the EOD Review UI should:
  1. Display the original Planned Target.
  2. Provide a mandatory numerical "Actual Completed" input.
  3. Auto-calculate status/percentage from that input.
  4. Show conditional follow-up fields when actual < planned — e.g.
     "Will you continue this tomorrow?" (yes/no) and a required "Why
     was this not completed?" text field.

Scope: frontend — the EOD Review modal, replacing the static Completed
badge with the numeric input + conditional fields. Backend — the
submission endpoint must accept an actual numeric value instead of (or
in addition to) the current boolean-style completion flag. Schema —
store actual-completed per task/commitment.

This directly depends on BUG-K (Planned Target must already be a real,
per-day editable value before "actual vs planned" comparison makes
sense). Do this AFTER BUG-K, not before — building the EOD side first
means either building it against the wrong data model or building it
twice.

Do not touch: the KPI Metric master definition or Admin KPI Management.

Verify: (a) every KPI-linked commitment in EOD Review shows Planned
Target and an editable Actual Completed field, (b) percentage/status
calculates correctly at, above, and below target, (c) the "why not
completed" and "continue tomorrow" fields only appear when under
target, and are required (can't submit without them) when they appear,
(d) non-KPI-linked tasks (if any exist) aren't forced into this flow.
```

---

## BUG-P — Gross Pay doesn't match manual math due to rounded hours display

**Where:** HR Payroll Table

```
Fix: Approved Hours / Overtime are displayed rounded to 1-2 decimals,
but Gross Pay is calculated from the unrounded underlying value —
so anyone manually checking the math (hours × rate) gets a different
number than what's shown as Gross Pay. E.g. Patrick Tagab shows 0.02
hrs × ₱200 = ₱4.00 expected, but Gross Pay shows ₱3.33 (the real value
is 1 minute = 0.0166 hrs, rounded up to 0.02 for display only).

Expected: this is a display-only bug — the Gross Pay calculation itself
is using the correct precise value. Fix by showing hours in exact HH:MM
format instead of a rounded decimal, so the displayed time and the
displayed Gross Pay are always mutually consistent.

Scope: frontend formatting/display of the Approved Hours and Overtime
columns in the payroll table component only — convert decimal-hours to
HH:MM for display. Do NOT change the underlying stored value or the
Gross Pay calculation itself — confirm first that Gross Pay is in fact
already computed from the precise (unrounded) value and the bug is
purely presentational, not a calculation bug. If Gross Pay turns out to
ALSO be computed from a rounded intermediate value, treat that as a
separate, higher-severity finding and flag it rather than silently
fixing both here.

Do not touch: the rate table, overtime premium multiplier logic, or any
other payroll column.

Verify: (a) Patrick Tagab's row now shows 00:01 (or equivalent HH:MM)
instead of "0.02", and ₱3.33 now visibly reconciles against 1 minute at
₱200/hr, (b) Shan Gealone's row similarly reconciles, (c) spot check 2-3
other employees' rows to confirm the format change didn't break
alignment/sorting, (d) exporting the payroll table (if export exists)
uses the same corrected format, not the old decimal.
```

---

## BUG-Q — Supervisors can't edit employee time logs during review

**Where:** Supervisor Timesheet Review / Approval Module

```
Fix: when a timesheet has clearly wrong hours (e.g. forgot to clock
out, showing 12 hrs instead of 8), the supervisor's only option is to
request a revision and wait on the employee — there's no way to
directly correct Time In, Time Out, Total Hours, or Overtime after
discussing the discrepancy.

Expected: the supervisor review interface gains an "Edit Timesheet" /
"Adjust Hours" capability, restricted to the Supervisor role during
review, letting them override Time In, Time Out, Total Hours, and
Overtime before approving. Every such adjustment must be logged with
who made it and a required "Reason for adjustment" field — this is a
compliance-sensitive change to another person's time record.

Scope: frontend — an edit/adjust action visible only to Supervisor role
in the review view. Backend — a dedicated, permission-checked endpoint
for supervisor-initiated time adjustments (do not just loosen the
existing employee-edit endpoint to also allow supervisors — build this
as its own explicit action so the audit trail clearly distinguishes
"employee edited their own entry" from "supervisor overrode an entry").
Audit — write an AuditLog entry (repo already has this pattern for
payroll/HR mutations) capturing old values, new values, supervisor ID,
and the required reason text.

Do not touch: the employee's own self-edit flow (BUG-A / revision-
requested editing) — this is a separate, supervisor-only override path,
not an extension of the employee's edit permissions.

Verify: (a) only supervisors (not employees) see the adjust action, (b)
adjustment requires a non-empty reason before it can be saved, (c) an
AuditLog record is created with before/after values and supervisor
identity, (d) after adjustment, approving the timesheet uses the
corrected values (confirm payroll sync — BUG-003 from the prior QA
round — picks up the adjusted numbers, not the original inflated ones),
(e) employee's own edit permissions are unchanged.
```

---

## BUG-R — Sidebar notification badge gives no in-page context

**Where:** Sidebar Navigation (Timesheets tab) and the Timesheets main page

```
Fix: a red badge (e.g. "1") appears on the Timesheets sidebar item, but
opening the page shows the standard view with no indication of what
needs attention — no highlighted row, no banner, no auto-filter.

Expected:
  1. Opening the page from a notification auto-filters or scrolls to
     the specific item that triggered it (e.g. defaults to "Needs
     Revision"/"Rejected" if that's the cause).
  2. The specific row/card is visually highlighted.
  3. The sidebar badge clears only after the user has actually viewed/
     interacted with that specific item — not just after loading the
     page.

Scope: frontend — link the notification's payload (which should already
carry a reference to the specific timesheet/entry, per the existing
Notification pattern used elsewhere in the repo) to an auto-filter/
highlight on page load, and update badge-clearing logic to fire on
interaction with the specific item rather than on page visit.

Do not touch: the notification creation/trigger logic itself (what
causes a badge to appear) — this bug is entirely about what happens
AFTER the user clicks into the page. Also do not change badge behavior
for any other sidebar item (e.g. if Daily Scrum has a similar badge,
leave it as-is unless asked to apply this pattern more broadly).

Verify: (a) triggering a notification (e.g. supervisor requests
revision) and clicking the Timesheets badge lands the user on the
correct filtered/highlighted item, (b) the badge clears only after
interacting with that item, not merely opening the page, (c) navigating
to Timesheets normally (not via the badge) still shows the standard
unfiltered view, (d) multiple pending notifications (if possible) don't
cause the highlight/filter to point at the wrong item.
```

---

## BUG-S — Profile picture updates don't sync globally across accounts

**Where:** Global user directories (e.g. Management → Employees list) and other sessions/roles viewing a user's profile

```
Fix: when a user uploads a new profile picture, it's only visible in
their own local session. Other users (admin, HR, etc.) viewing the
Employees directory or that user's profile still see the default
initials-based avatar — the update either isn't persisted globally or
isn't being read by other pages/sessions.

Expected: the uploaded image is saved as the user's global avatar (via
the existing StorageProvider — repo already stores avatars in the
`avatars` folder per CLAUDE.md), and every page that fetches user data
(Employee Directory, profile modals, etc.) reads and displays that
stored image URL instead of falling back to initials, for all users
and roles.

Scope:
- Backend: confirm the avatar upload endpoint actually writes the
  resulting image URL to the user's DB record (not just to a
  session/local cache), and confirm the Employee list / user-fetch
  endpoints include that URL field in their response payload — this is
  likely the actual gap (upload works, but the list endpoint's select/
  serializer omits the avatar URL).
- Frontend: the shared Avatar component should render the fetched image
  URL when present and fall back to initials only when it's null —
  apply this consistently, don't special-case it per page.

Do not touch: the upload mechanism itself (file size/type validation,
storage provider selection) unless it's provably broken — first confirm
whether the URL is even reaching the DB before assuming the upload path
is at fault. Do not touch unrelated user-list fields/columns.

Verify: (a) upload a photo as one user, then check the Employees
directory as a different logged-in user (admin/HR) and confirm the
photo now appears instead of initials, (b) a user who has never
uploaded a photo still correctly shows initials (fallback not broken),
(c) check at least 2 other pages that display user avatars (e.g.
profile modal, timesheet review panel) to confirm the fix applies
everywhere the Avatar component is used, not just the Employees list,
(d) refreshing/re-logging as the uploading user still shows their own
photo (regression check on the original working case).
```

---

## BUG-T — Performance Report throws "search is not defined" error

**Where:** Employee → Performance (accessed via `/performance` route)

```
Fix: clicking the Performance Report (or navigating to /performance)
renders an error page: "Something went wrong - search is not defined".
The page does not load; users cannot access the report.

Expected: the Performance Report page loads without error and displays
the user's performance data / KPI scorecard or similar report content.

Scope: frontend component bug — the error indicates either:
  (1) a `search` variable/function is referenced but never declared or
      imported, OR
  (2) a state hook initializing `search` is missing/broken, OR
  (3) the component is missing a provider or context that supplies
      `search` to child components.

Before editing: check the actual Performance Report component
(likely `apps/web/src/modules/performance/...` or similar path) and
search for all references to a `search` variable — it's likely used
without being defined. Also check whether this component uses hooks
or context that should be providing it. The error is probably
straightforward (typo, missing import, missing state initializer) —
diagnose first before writing a fix.

Do not touch: the data-fetching logic or report calculation — if those
are broken they'll show up after the page stops erroring, address them
separately.

Verify: (a) the Performance Report page loads without any error messages,
(b) it displays some content (even if blank or placeholder), (c)
navigating back to other pages from Performance Report works normally,
(d) this error doesn't appear in any other report or page.
```

---

## BUG-U — Completed Daily Scrum commitments stay "In Progress" and remain editable

**Where:** Employee → Daily Scrum → Today's Commitments

```
Fix: after an employee completes and submits an End-of-Day (EOD) report,
the commitment still shows status "In Progress" (should be "Completed").
More critically, Edit and Delete buttons remain enabled on completed
commitments — users can modify or delete records that have already been
submitted and should be locked.

Expected:
  1. After successful EOD submission, commitment status auto-updates to
     "Completed" and stays visible but locked (read-only).
  2. Edit and Delete actions are disabled/hidden for completed
     commitments.
  3. A completed commitment can only be reopened through an authorized
     approval/revision process (not a direct employee edit).
  4. The completion progress/data reflects the final submitted EOD values,
     not a stale intermediate state.

Scope:
- Backend: confirm the EOD submission endpoint marks the commitment
  record as completed (status field update) and persists that state.
  Also check whether the commitment is being fetched/returned in
  subsequent list queries (Today's Commitments should still display it,
  just with status=Completed, not filtered out).
- Frontend: bind the Edit/Delete button visibility to commitment.status
  — disable these actions when status === "Completed". Also verify the
  status field in the Today's Commitments list is being read from the
  backend response, not cached from the pre-EOD state.

Note: this is distinct from BUG-O (which adds the Actual Completed input
field to the EOD Review form itself). This bug is about what happens
AFTER the EOD is submitted — the persistence and UI lock-down of the
completed record.

Do not touch: the EOD Review submission logic (BUG-O covers that) — this
is purely about the front-end state after submission and the action
button visibility.

Verify: (a) complete and submit an EOD report, refresh or re-navigate to
Today's Commitments, confirm the commitment now shows "Completed" status
(not In Progress), (b) Edit/Delete buttons are visibly gone/disabled for
that completed commitment, (c) attempting to direct-edit the backend
record (if possible via an API call) is rejected with a permission error
— the commitment should be immutable until explicitly reopened, (d) a
non-completed commitment (e.g. still In Progress or Pending) still shows
Edit/Delete normally.
```

---

## BUG-V — Leave dashboard counters don't update after new leave input (Pending, Approved Today, Rejected Today, Active Leave)

**Where:** Supervisor / HR Dashboard (leave management section)

```
Fix: the leave status counters (Pending leave, Approved Today, Rejected
Today, Active Leave) fail to update when new leave requests are created,
approved, rejected, or activated. The counters show stale numbers until
a manual page refresh.

Expected: immediately after any leave action (create, approve, reject,
activate, end), the affected counter(s) recalculate and display the new
total without requiring a page reload.

Scope: frontend state management / cache invalidation after leave
mutations. This is likely one of two issues:
  1. The leave-update endpoint(s) don't trigger a refetch/cache
     invalidation on the dashboard query, or
  2. The dashboard component isn't subscribed to realtime updates for
     leave changes, or
  3. The frontend state is being updated locally but not persisted/
     fetched from the backend, causing stale numbers to appear.

Diagnose: check whether leave mutations are refetching the dashboard
query (or invalidating a cache key), and whether the dashboard component
has a subscription/listener for leave changes. The repo likely uses
either React Query / SWR for caching (which has cache invalidation
patterns) or a custom fetch + state combo.

Do not touch: the leave request/approval business logic itself — this is
purely a UI refresh issue, not a data-correctness issue (the backend
count is probably correct, just not being displayed).

Verify: (a) create a leave request and immediately (without refresh)
check if "Pending leave" counter increments, (b) approve that request
and check if "Approved Today" increments and "Pending leave" decrements,
(c) reject a pending request and check "Rejected Today" increments and
"Pending leave" decrements, (d) activate a leave and check "Active
Leave" increments, (e) end an active leave (e.g. via BUG-N's "Return to
Work" button) and check "Active Leave" decrements. All without a manual
page refresh.
```

---

## BUG-W — "Version mismatch" error when submitting End of Day Review

**Where:** End of Day Review modal (when clicking Submit Review & Time Out)

```
Fix: attempting to submit an End of Day Review displays a "Version
mismatch" error banner and rejects the submission. The modal won't close
and the employee can't complete their EOD.

Expected: the EOD submission should succeed (or provide a clear recovery
path if the record truly was modified by another user/process in the
interim).

Scope: this is likely an optimistic concurrency control issue — the
backend is checking a version/timestamp field to prevent concurrent
overwrites, but either:
  1. The frontend isn't sending the current version in the update
     payload, or
  2. The frontend version is stale (fetched earlier, but the record was
     updated server-side in between), or
  3. The version-check logic on the backend is too strict or broken.

Before editing: confirm whether this happens in a single-user scenario
(fresh EOD for the same employee, no concurrent edits) or only when
multiple users/sessions touch the same record. If it's single-user and
still fails, the version-check logic is likely broken. If it only fails
on concurrent edits, the logic is working but the error messaging
and recovery path need improvement.

Do not touch: the general optimistic concurrency pattern — it's good to
have. Just fix the bug in its implementation so single-user EOD
submissions work reliably.

Verify: (a) submit an EOD in a fresh, non-concurrent scenario and
confirm it succeeds without version-mismatch error, (b) if possible,
trigger a concurrent edit (two users/sessions on the same record) and
verify the error appears, (c) after version-mismatch error, can the user
retry by refreshing the modal or clicking Submit again — or are they
stuck? If stuck, improve the error UX to allow a refresh.
```

---

## BUG-X — No way to reactivate a deactivated account

**Where:** Admin → Employee Directory (account management)

```
Fix: once an account is deactivated (via some Admin action, e.g.
Deactivate button or dropdown), there's no UI control or workflow to
reactivate/restore it. The account remains permanently deactivated.

Expected: a Reactivate or Restore action should be visible on deactivated
accounts, allowing admins to restore the account to Active status without
recreating it.

Scope: frontend — add a Reactivate action (button, dropdown option) that
appears only for deactivated accounts. Backend — a reactivate endpoint
that sets the account status back to Active.

Do not touch: the deactivate logic itself — this is purely about adding
the reverse operation.

Verify: (a) deactivate an account and confirm the Reactivate action
appears on that account's row/modal, (b) click Reactivate and confirm
the account's status is now Active again, (c) that user can now log in
(assuming their password/email are still intact), (d) an already-Active
account does not show a Reactivate action.
```

---

## BUG-Y — "Email is not verified" error appears on login after password change, even though email was already verified in Admin

**Where:** Login page (after changing password) and Admin account verification status

```
Fix: an account's email is verified in Admin (or verified by the user).
Later, the user changes their password and tries to log in. The login
rejects them with "Email is not verified" even though it was already
verified.

Expected: changing a password should never reset or clear the email
verification status. Once verified, it stays verified unless explicitly
unverified by an Admin action.

Scope: the password-change endpoint — confirm it's not accidentally
resetting the email_verified flag to false or unchecked. Also check the
login validation logic — it should allow login if email is verified,
regardless of whether the password was just changed.

Before editing: confirm whether the email_verified flag is actually
being reset by the password-change flow (check the DB/logs), or whether
the login check has a bug (e.g. checking the wrong field, or checking a
stale cached value). Diagnosis determines the fix.

Do not touch: the email-verification flow itself (send email, confirm
token, etc.) — this bug is specifically about password change not
triggering a re-verification requirement.

Verify: (a) verify an account's email in Admin or via normal verification
flow, (b) change that user's password, (c) attempt login with the new
password, (d) confirm login succeeds without any "email not verified"
error, (e) spot-check the DB to confirm the email_verified flag is still
true after the password change.
```

---

## BUG-Z — Dashboard "Hours This Month" widget severely undercalculates vs. Timesheet totals

**Where:** Employee Dashboard (Hours This Month card) vs. My Timesheet (30-day filter)

```
Fix: the Dashboard's "Hours This Month" widget shows a drastically lower
total (e.g. 10.6h) compared to the Timesheet module's actual aggregated
hours for the same month (e.g. 252h 26m / 208h 36m). The two should
always match.

Expected: the Dashboard widget must aggregate ALL time entries for the
current calendar month, applying the same date-range logic as the
Timesheet module, so both views reflect the same total.

Scope: backend API endpoint feeding the dashboard widget — likely has
broken date-filtering logic or is querying against the wrong date range
(e.g. only last N days instead of calendar month). Before editing:
confirm what date range the widget is actually querying (check the API
call / logs), and compare it to the Timesheet's date range.

Do not touch: the Timesheet aggregation logic — assume it's correct and
fix the dashboard query to match it.

Verify: (a) pull the dashboard widget's API response and confirm it's
querying the correct date range for "this month", (b) manually sum the
timesheet entries for that same month and confirm it matches Timesheet's
displayed total, (c) update the dashboard endpoint to use the same date
logic, (d) refresh the dashboard and confirm the Hours This Month value
now matches Timesheet's total.
```

**Resolution:** Fixed — but the expected value stated above was wrong, and
the "do not touch" instruction pointed at the wrong module. Both views were
broken, in opposite directions.

**Corrected expected value:** for `employee@demo.test` in July 2026 the true
total is **225h 38m** (13538 minutes across 102 entries, confirmed by direct
DB query). The **252h 26m** quoted above was not ground truth — it was the
Timesheet page's own double-count. Do not use it as a target.

Two independent defects produced the gap:

1. *Dashboard undercount* — the widget summed `Timesheet.totalMinutes` under
   `periodStart >= from AND periodEnd <= to`. The rollup only exists once a
   period is aggregated, and `periodEnd <= to` with `to = now` discarded the
   entire in-progress period plus any period straddling the 1st. Fixed in
   `dashboard.service.ts` by aggregating `TimeEntry` on `startTime`
   (commit `5c96df3`, branch `fix/dashboard-hours-this-month`).

2. *Timesheet overcount* — every paginated list endpoint filtered
   `where: { id: { gt: cursor } }` while ordering by a different column, so
   walking all pages repeated some rows and skipped others. For this account
   `GET /time-entries` returned 112 rows for 102 entries. The Timesheet page
   sums that walk, so its displayed total was inflated by ~27h. Fixed across
   all 18 call sites by switching to Prisma's native cursor
   (commit `328ecf0`, branch `fix/cursor-pagination-keyset`).

Both views now report 225.6h. Note that **any hours figure exported or
reported from a paginated walk before `328ecf0` is inflated**, not just the
Timesheet page.

---

## BUG-AA — "Return to Work / End Leave" button doesn't update leave status (button remains visible)

**Where:** Employee Dashboard (leave banner) — when clicking the "Return to Work / End Leave" button

```
Fix: clicking the "Return to Work / End Leave" button on the employee
dashboard's leave banner has no effect — the button remains visible and
the leave status doesn't change to Active/Working. The employee is still
marked as on leave.

Expected: clicking the button should immediately:
  1. Change the leave status from "Active Leave" to "Returned" or
     "Completed"
  2. Update the user's availability status to Active/Working
  3. Hide/disable the Return to Work button (since leave is now ended)
  4. Fire a notification to supervisor + HR

Scope: either frontend (button click handler isn't wired or isn't calling
the backend) or backend (the return-to-work endpoint exists but is broken
or permission-denied). Before editing: click the button, open browser
console/network tab, and confirm whether an API request is even being
sent. If yes, check the response (success vs. error). If no request is
sent, the frontend handler is broken.

Note: this is related to BUG-N (which added the "Return to Work" flow
conceptually) and BUG-V (which handles the supervisor's dashboard
counter update). This bug is specifically about the button action itself
not executing.

Do not touch: the leave approval/creation workflow — this is only about
ending an active leave early.

Verify: (a) an employee currently on leave clicks the Return to Work
button, (b) confirm an API request is sent (check Network tab), (c)
confirm the response is successful (200, not 400/403/500), (d) confirm
the leave status in the DB changed to completed/returned, (e) the button
disappears and the employee's availability status is now Active, (f)
supervisor's "Active Leave" counter decremented (depends on BUG-V fix).
```

---

## BUG-AB — Leave request "View Details" link redirects to Dashboard instead of the specific leave request

**Where:** Notification inbox (Leave request approved/rejected notifications)

```
Fix: clicking the "View Details" link on a leave request notification
(approved, rejected, etc.) redirects the user to the Dashboard instead
of opening the specific leave request record or approval details.

Expected: "View Details" should deep-link directly to the specific leave
request — opening either:
  (a) the leave request detail page/modal, or
  (b) the approval workflow page if the request is pending review, or
  (c) the leave record in the Leave Management module.

Scope: the notification link routing — the "View Details" link either:
  1. isn't wired to a specific leave-request ID (it's just pointing to
     a generic "leave" page), or
  2. the deep-link route exists but the link is broken/malformed, or
  3. there's a permission check blocking access to the specific record.

Before editing: check the notification object to see if it carries a
leave-request ID or record reference. Then check the link's href/route
to see what ID (if any) is being passed. Diagnosis determines the fix.

Do not touch: the notification creation/sending logic — this bug is
purely about the link routing after the notification arrives.

Verify: (a) receive/open a leave request notification (create/approve
one or wait for an existing one), (b) click "View Details", (c) confirm
you land on the specific leave request (not the generic Dashboard), (d)
the URL shows the leave-request ID or similar identifier (not just
"dashboard"), (e) you can see and interact with the leave request
details (approval buttons, reason, dates, etc., depending on the user's
role and the request's status).
```

---

## BUG-AC — Missing feature: employees can't view their leave request details from notifications

**Where:** Employee notifications and employee dashboard (when viewing their own leave requests)

```
Fix: when an employee receives a notification about their leave request
(approved, rejected, pending), clicking "View Details" has no destination.
Employees also can't see a detailed view of their own leave requests
elsewhere in the system (the Leave Management page is supervisor-only).

Note: The Supervisor → Leave Management page already exists and is fully
functional. This bug is specifically about the EMPLOYEE VIEW of their own
leave request details, accessible from notifications and potentially
their own dashboard.

Expected: a leave request detail modal that employees can access by:
  1. Clicking "View Details" on a leave request notification
  2. (Optional) Clicking on a leave request row in their own leave
     history/dashboard view

The modal should display (read-only for employees):
  - Request status (pending, approved, rejected)
  - Requested dates and duration
  - Reason/comment they provided
  - If approved/rejected: the approver's name, timestamp, and any
    rejection reason/comments

Scope: frontend — build the employee-facing leave request detail modal
component. Backend — ensure the leave-request API endpoint exposes all
necessary fields when queried by the employee viewing their own request.

This is a foundational missing feature blocking BUG-AB's "View Details"
link. The supervisor Leave Management already works.

Do not touch: the Supervisor Leave Management page (already exists and
works), the leave request creation/approval workflow.

Verify: (a) an employee receives a leave request notification
(create/approve a request or wait for one), (b) clicking "View Details"
opens a modal (not dashboard redirect), (c) the modal displays request
details (dates, status, reason, approver info), (d) the modal is
read-only for employees (no edit buttons), (e) the modal can be closed
via X or outside-click, (f) this does not interfere with the existing
Supervisor Leave Management page.
```

---

## BUG-AD — Leave Request Details modal opens off-screen / not immediately visible

**Where:** Employee notifications / leave request list (when clicking "View Details")

```
Fix: the Leave Request Details modal does open and contains the correct
data, BUT it appears positioned below the current viewport (off-screen
or below the fold). The user must scroll down to see the modal, which
is unexpected UX — modals should open centered and immediately visible.

Expected: when clicking "View Details" on a leave request notification
or link, the modal should:
  1. Open centered on the screen (vertically and horizontally)
  2. Be immediately visible without requiring any scroll
  3. Have proper z-index so it appears on top of all other content
  4. Optionally: scroll the page up if needed to ensure the modal's
     header/title is visible in the viewport

Scope: frontend modal rendering — likely a CSS/positioning issue or a
missing scroll-to-top/focus behavior when the modal mounts.

Do not touch: the modal's content, data fetching, or close behavior —
this is purely about visibility/positioning when it first opens.

Verify: (a) click "View Details" on a leave request, (b) the modal
immediately appears centered on screen without any scroll required, (c)
the modal's header and top controls (X button) are visible, (d) you can
close the modal and re-open it with the same good behavior, (e) this
works on different screen sizes/resolutions.
```

---

## Suggested order

Group by risk and independence — do standalone/low-risk items first, save anything touching KPI data model or RBAC role assignment for its own isolated session:

1. BUG-T (Performance Report "search is not defined" — blocks page load, high priority)
2. BUG-Z (Dashboard hours aggregation mismatch vs. Timesheet — critical for reporting accuracy)
3. BUG-F (copy only — trivial warm-up)
4. BUG-J (icon only — trivial)
5. BUG-I (remove redundant button — frontend only)
6. BUG-E (profile modal conditional rendering — frontend only)
7. BUG-P (Gross Pay display formatting — frontend only, confirm calc is already correct)
8. BUG-G (payrun table columns — additive, low risk)
9. BUG-C (directory query missing supervisor role)
10. BUG-H (HR permission grant — isolated RBAC change)
11. BUG-D (email uniqueness — **check for existing duplicate data before running the migration**)
12. BUG-R (notification badge → in-page highlight/filter)
13. BUG-AC (Missing leave request detail/review page — foundational feature, blocks BUG-AB and other workflows; must come before BUG-AB can work)
14. BUG-AD (Leave Request Details modal opens off-screen/not visible — UX issue; fix after BUG-AC is built)
15. BUG-AB (Leave request "View Details" link routes wrong — notification deep-linking bug; assumes BUG-AC detail page exists)
16. BUG-Y (Email verification flag shouldn't reset after password change — login blocker, do early)
17. BUG-X (No way to reactivate deactivated accounts — missing action)
18. BUG-A (timesheet row → audit link + edit-lock)
19. BUG-M (exclude supervisor from underperforming list)
20. BUG-N (return-from-leave flow)
21. BUG-AA (Return to Work button doesn't execute — BUG-N's implementation is broken; critical for leave workflow)
22. BUG-V (leave dashboard counters don't update — data-sync/cache invalidation; sequence after BUG-N/AA since it validates the full leave flow works end-to-end)
23. BUG-B (role escalation on supervisor assignment — RBAC, do alone)
24. BUG-Q (supervisor time-adjustment override — compliance-sensitive, own session; verify it feeds correctly into BUG-003's payroll sync from the prior QA round)
25. BUG-W (Version mismatch on EOD submit — blocks EOD completion, high priority; fix before adding new EOD features)
26. BUG-L (scorecard aggregation view — new endpoint + scoping rules)
27. BUG-K (Planned Target editable + Actual Completed — touches KPI data model; if BUG-007's KPI integration work is done in the same project, sequence this AFTER that so they don't define conflicting KPI-tracking fields)
28. BUG-O (EOD "Actual Completed" input — depends on BUG-K, must come after it; also assumes BUG-W's version-mismatch bug is fixed so EOD can submit)
29. BUG-U (Completed commitments remain editable + stay "In Progress" — depends on BUG-O working, should come after to verify the post-EOD state is correct)
30. BUG-S (avatar sync — backend serializer/select fix + shared Avatar component fallback; low interdependency with others, but check the Avatar component broadly since it likely renders in many places)
