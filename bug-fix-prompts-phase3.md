# TimeForge Bug Fix Prompts — Phase 3

Source: `User-journey-suggestions.pdf` — 23 UX/user journey defects (BUG-AV–BUG-BP), focused on navigation, layout consistency, and employee workflow clarity.

**How to use this:** Same format as Phase 1 & 2. Run one bug at a time, follow the shared rules, verify each fix before moving to the next. These bugs are grouped by feature area (notifications, navigation, pages, forms). Start with high-impact workflow issues, then move to layout/consistency cleanup.

---

## Shared rules (paste once per session)

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
6. If the fix requires a migration, generate it — don't hand-edit the DB.
```

---

## BUG-AV — Search bar and notification icon are non-functional in top bar

**Where:** Employee → Top Navigation Bar (Search icon, Notification bell)

```
Fix: the search bar and notification bell icon appear in the top bar but
have no functionality. They look clickable but do nothing, confusing the
user.

Expected: both should be fully functional:
  1. Search Bar: Clicking or typing searches across tasks, projects,
     outputs, sprints. Returns relevant results or navigates to matching
     page.
  2. Notification Bell: Clicking opens a dropdown popover showing:
     - Filter by All vs. Unread
     - "Mark all as read" button
     - Direct links to actionable items (e.g., "You were assigned to
       Sprint 4", "Your timesheet was approved")
     - "View All Notifications" link that opens a dedicated /notifications
       page with date/category filters and history clearing

Scope: frontend — implement search handler and notification popover
component. Backend — implement search endpoint and notification querying.

Do not touch: existing navigation or page routing — this is purely adding
the missing handlers.

Verify: (a) search bar accepts input and returns results, (b) bell icon
opens popover, (c) popover shows unread notifications, (d) "Mark all as
read" works, (e) "View All Notifications" link opens dedicated page, (f)
dedicated page has date range/category filters.
```

---

## BUG-AW — Settings & Sign Out duplicated in sidebar vs. profile dropdown

**Where:** All Roles → Sidebar Navigation (bottom section) and Profile Icon Dropdown

```
Fix: Settings and Sign Out appear in two places each:
  1. Bottom of main sidebar (Settings + Sign Out)
  2. Profile dropdown menu (top right, Settings + Sign Out)
  
Clicking either pair redirects to the same route/action, creating navigation
confusion and cluttering the sidebar. All roles affected:
  - Employees (AppSidebar + SidebarBottomSection)
  - Admins (AdminSidebar + SidebarBottomSection)
  - HR (AppShell → AdminSidebar + SidebarBottomSection)
  - Supervisors (AppShell → AdminSidebar + SidebarBottomSection)
  - Finance (FinanceAppShell → FinanceSidebar + SidebarBottomSection)

Expected: consolidate by moving BOTH to the Profile Dropdown only:
  1. Remove Settings from SidebarBottomSection.tsx
  2. Remove Sign Out from SidebarBottomSection.tsx
  3. Remove Settings from AppSidebar.tsx (custom sidebar)
  4. Ensure Profile Dropdown (UserMenu.tsx) has exactly four items:
     - Profile
     - Settings
     - Notifications
     - Sign Out
  5. Routes remain the same; only the access points change.

Scope: frontend — remove Settings & Sign Out from sidebar components.
  Files to touch:
    - SidebarBottomSection.tsx (used by AdminSidebar & FinanceSidebar)
    - AppSidebar.tsx (employee sidebar, hardcoded Settings link)
  UserMenu.tsx already has both items and needs no changes.

Do not touch: the Settings page, logout logic, or any backend logic.

Verify: (a) Settings no longer in sidebar, (b) Sign Out no longer in sidebar,
(c) Profile dropdown shows Profile, Settings, Notifications, Sign Out,
(d) clicking Settings navigates correctly, (e) clicking Sign Out logs out,
(f) all roles see the same consolidated UX, (g) no broken links.
```

---

## BUG-AX — Dashboard empty state says "No projects yet" instead of helpful message

**Where:** Employee → Dashboard → Recent Projects section (empty state)

```
Fix: when an employee has no assigned projects, the empty state displays
"No projects yet" — sounds like a system error or missing data, causing
confusion.

Expected: replace with "You haven't been assigned to any projects yet."
with an optional subtext like "Check your Sprint Board for standalone
tasks" or simply leave a clean, informative graphic so they know they
aren't missing anything.

Scope: frontend UI text — update empty state message in Recent Projects
component.

Do not touch: the projects logic or any data fetching.

Verify: (a) empty state message is user-friendly, (b) no "Create Project"
button appears (employees can't create projects), (c) message is clear
that it's not an error.
```

---

## BUG-AY — Dashboard KPIs are project-focused, not employee-focused

**Where:** Employee → Dashboard → Top metric boxes

```
Fix: the top boxes show "Active Projects" and "Completed" — metrics that
don't reflect what an employee actually cares about (workload and hours).

Expected: replace or supplement with employee-centric metrics:
  - Hours Logged This Week
  - Tasks Due Today
  - Outputs Approved (this week)
  
These make the dashboard immediately useful for their daily routine.

Scope: frontend — update the dashboard metric cards. Backend — provide
API endpoints for these metrics if they don't exist.

Do not touch: project-level reporting or admin dashboards.

Verify: (a) dashboard shows Hours Logged This Week, (b) shows Tasks Due
Today, (c) shows Outputs Approved, (d) numbers are accurate and update
daily, (e) employees find this more relevant than project counts.
```

---

## BUG-AZ — Dashboard missing quick action buttons for daily tasks

**Where:** Employee → Dashboard → Below top metric boxes

```
Fix: an employee has to hunt through the sidebar every morning to find
common actions like clocking in or logging output.

Expected: add a "Quick Actions" row below the metric boxes with
easy-to-click buttons:
  - Clock In / Out
  - Log Output
  - View Active Sprint
  
This saves them from sidebar navigation every single morning.

Scope: frontend UI — add a quick-actions row component with four large
buttons that link to the most common daily tasks.

Do not touch: the actual clock-in, output, or sprint logic.

Verify: (a) Quick Actions row appears on dashboard, (b) Clock In/Out
button takes to Time Clock page, (c) Log Output button takes to Outputs
page, (d) View Active Sprint button takes to Sprint Board, (e) buttons
are large and easy to click.
```

---

## BUG-BA — Dashboard "Recent Projects" should show employee's specific tasks, not project overview

**Where:** Employee → Dashboard → Recent Projects section

```
Fix: the "Recent Projects" area lists the whole project status, which is
overwhelming or irrelevant to an individual employee. They need to see
their own work within the project, not the entire project's status.

Expected: instead of listing the project name only, show:
  - Their specific next task within that project, OR
  - A quick link that takes them straight to their assigned work

This keeps them focused on their individual contribution, not project-wide
metrics.

Scope: frontend — update Recent Projects component to fetch and display
employee's assigned tasks per project. Backend — query only the tasks
assigned to the logged-in employee for each project.

Do not touch: project pages or project-level reporting.

Verify: (a) Recent Projects shows employee's specific tasks, not full
project overview, (b) clicking a task takes to task detail/sprint board,
(c) empty state still works, (d) only shows projects the employee is
assigned to.
```

---

## BUG-BB — Projects page empty state says "No projects found"

**Where:** Employee → Projects page (empty state)

```
Fix: empty state displays "No projects found" — sounds like a broken
search or system error, not a valid empty state.

Expected: change to "You haven't been assigned to any projects yet." with
optional subtext like "Contact your administrator or project manager to
get added to a project."

Scope: frontend UI text — update empty state message.

Do not touch: projects logic or data fetching.

Verify: (a) empty state message is clear and helpful, (b) message doesn't
sound like an error.
```

---

## BUG-BC — Projects page empty state has active search/filters when no projects exist

**Where:** Employee → Projects page → Search bar and filter dropdowns

```
Fix: when 0 projects exist, the search bar and filter dropdowns ("All
Status", "All Priority") are still active and clickable. This confuses
the user — they try to search/filter but nothing happens because there's
nothing to search.

Expected: disable or auto-hide search/filter controls when 0 projects are
assigned. Once at least one project is assigned, enable them.

Scope: frontend — conditional rendering of search/filter controls based
on project count.

Do not touch: the search/filter logic itself.

Verify: (a) with 0 projects, search bar is disabled/hidden, (b) filter
dropdowns are disabled/hidden, (c) once a project is assigned, search/
filters become active, (d) existing projects still allow filtering.
```

---

## BUG-BD — Projects page empty table spans full screen width

**Where:** Employee → Projects page → Empty table container

```
Fix: when empty, the table card spans the entire screen width, creating
massive blank visual space. On widescreen monitors, it looks stretched and
unbalanced.

Expected: cap the maximum width of the table card or center-align the main
wrapper so it doesn't stretch on high-resolution monitors. Content should
be balanced and centered.

Scope: frontend CSS/layout — constrain table width and center it.

Do not touch: table content or data.

Verify: (a) on widescreen (1920px+), table is centered and not stretched,
(b) on smaller screens, table still fills appropriately, (c) visual
balance is improved.
```

---

## BUG-BE — Projects page missing actionable helper button in empty state

**Where:** Employee → Projects page → Empty state container

```
Fix: the user reaches a dead end with no way to navigate back to active
work when they have no assigned projects.

Expected: add a secondary call-to-action button inside the empty state
container like "Go to My Timesheet" or "View Sprint Board" so the employee
can jump back to their active daily work without manually clicking the
sidebar.

Scope: frontend — add a secondary button to the empty state component.

Do not touch: navigation routing.

Verify: (a) empty state shows a secondary helper button, (b) clicking it
navigates to an active section (Timesheet or Sprint Board), (c) button
appears only when projects list is empty.
```

---

## BUG-BF — Time Clock and My Timesheet are separate pages when they should be unified

**Where:** Employee → Sidebar: "Time Clock" and "My Timesheet" are separate nav items

```
Fix: two separate pages (Time Clock and My Timesheet) should be one unified
page to reduce navigation friction and provide a complete time-tracking
workflow in one view.

Expected: restructure as a single unified "Time & Timesheets" page with:
  
  TOP SECTION (Live Controls):
    - Compact punch clock widget (Clock In/Out, Start Break buttons)
    - Metric cards to the right: Net Hours, Billable, Overtime
  
  BOTTOM SECTION (Historical Log):
    - Weekly timesheet table (date, in/out times, total, status, actions)
    - Date range picker aligned above table
    - Status badge and Withdraw/Submit actions inline in table rows

Scope: frontend — create unified page component, update sidebar nav to show
single "Time & Timesheets" link. Backend — ensure time-tracking endpoints
support both real-time clock and historical timesheet queries.

Do not touch: the clock-in/out logic or timesheet approval workflow.

Verify: (a) single "Time & Timesheets" nav link in sidebar, (b) page shows
live clock at top and weekly table below, (c) Clock In/Out buttons work,
(d) table entries update in real-time after clock-out, (e) date picker
lets user navigate past weeks, (f) Submit/Withdraw actions are inline.
```

---

## BUG-BG — Outputs page has large form taking up entire screen

**Where:** Employee → Output Log (Current layout)

```
Fix: the New Output Entry form is permanently displayed at the top of the
page, taking up almost the entire screen. This blocks the view of recent
outputs and clutters the interface.

Expected: move the form into a modal or collapsible drawer:

  OPTION A (RECOMMENDED): Modal/Drawer
    - Page defaults to My Outputs view (summary cards + table)
    - "+ Log Output" button at top right
    - Clicking it opens New Output Entry form in a slide-over drawer or
      modal overlay

  OPTION B: Collapsible Card
    - Form stays at top but is collapsed by default (or open only if no
      entries exist yet)
    - User can expand when needed

Scope: frontend — refactor form into modal/drawer component, update page
layout. Move form state management accordingly.

Do not touch: form submission or validation logic.

Verify: (a) page defaults to showing outputs summary + table, (b) "+ Log
Output" button opens form modal, (c) modal closes after submit, (d) existing
outputs remain visible and unaffected, (e) can close modal without
submitting.
```

---

## BUG-BH — Outputs form doesn't auto-populate assigned project/client

**Where:** Employee → Outputs → New Output Entry form (Project and Client fields)

```
Fix: if an employee is assigned to a project/sprint, the Project and Client
fields still show "No project" and "No client", requiring manual entry every
time.

Expected: auto-populate Project and Client fields from the employee's
current assignment(s). If assigned to multiple projects, show a dropdown
for selection. Empty state message should explain why it's empty if no
assignment exists.

Scope: frontend — fetch employee assignments on form load, pre-fill fields.
Backend — provide endpoint listing employee's current projects/clients.

Do not touch: project assignment logic.

Verify: (a) form loads with Project/Client pre-filled if assigned, (b) if
multiple assignments, dropdown allows selection, (c) if no assignment,
shows helpful message, (d) user can still manually override the selection.
```

---

## BUG-BI — Outputs form asks employee for manager-evaluated fields (Quality Score, Deadline Score)

**Where:** Employee → Outputs → New Output Entry form

```
Fix: the form includes "Quality Score (0-100)" and "Deadline Score" fields
that are typically evaluated by managers during reviews, not employee-
provided. This causes confusion about what the employee should enter.

Expected: hide or auto-calculate these fields. Employee should only input:
  - Output Type
  - Quantity
  - Proof Link
  - Notes
  
Managers can evaluate Quality and Deadline scores during the review process,
not during employee submission.

Scope: frontend — remove or hide Quality Score and Deadline Score from
employee input. Optionally show them as read-only (manager-evaluated) after
submission.

Do not touch: manager review workflow or scoring logic.

Verify: (a) Quality Score and Deadline Score fields are hidden or labeled
as manager-evaluated (read-only), (b) employee can submit output with only
Type, Qty, Proof Link, Notes, (c) no validation errors from missing scores.
```

---

## BUG-BJ — Outputs form "Linked Time Entry" is a text field instead of a dropdown

**Where:** Employee → Outputs → New Output Entry form → Linked Time Entry field

```
Fix: the "Linked Time Entry" field is a generic text input, forcing the
employee to manually type or search. Should be a smart dropdown showing
today's active time entries.

Expected: replace with a dropdown that shows:
  - All active/recent clock-in sessions from today
  - Employee can click to select, which auto-fills the time entry link
  - Falls back to text input if no recent sessions (for manual linking)

Scope: frontend — convert text input to dropdown component, fetch today's
time entries. Backend — provide endpoint for fetching employee's active
time sessions.

Do not touch: time entry storage or linking logic.

Verify: (a) Linked Time Entry is now a dropdown, (b) shows today's clock
sessions when focused, (c) selecting a session auto-fills the link, (d) can
still manually type if needed, (e) empty state shows helpful message.
```

---

## BUG-BK — Outputs sidebar has duplicate nav items

**Where:** Employee → Sidebar under OUTPUTS section

```
Fix: sidebar has separate "Output Log" and "My Outputs" links pointing to
the same or similar pages, creating redundancy.

Expected: consolidate into a single "Outputs" nav item (or "My Outputs").
Once unified page is live (BUG-BG), this single link takes to the unified
page.

Scope: frontend — remove Output Log link, rename My Outputs to Outputs (or
vice versa).

Do not touch: page routing or logic.

Verify: (a) sidebar shows only one Outputs/My Outputs link, (b) clicking it
navigates to the unified page, (c) no broken links.
```

---

## BUG-BL — Time Clock/My Timesheet sidebar has duplicate nav items

**Where:** Employee → Sidebar under WORK section

```
Fix: sidebar has separate "Time Clock" and "My Timesheet" links. Once
unified (BUG-BF), only one nav item should exist.

Expected: consolidate into a single "Time & Timesheets" (or "Time Tracking")
nav item that links to the unified page.

Scope: frontend — remove Time Clock link, rename My Timesheet to Time &
Timesheets.

Do not touch: page routing or logic.

Verify: (a) sidebar shows only one Time & Timesheets link, (b) clicking it
navigates to unified page, (c) no broken links.
```

---

## BUG-BM — Scorecards page forces employees to compute scorecard when stats auto-compute

**Where:** Employee → Scorecards page

```
Fix: design confusion — the page asks employees to compute/configure their
scorecard, but the current stats are already automatically computing the
scorecard. This creates redundancy and confuses the employee about when/
what to input.

Expected: clarify the workflow:
  OPTION A: Remove employee-side scorecard computation entirely if it's
            fully automated by the system.
  OPTION B: If manual input is needed, clearly label which fields are for
            employee input vs. manager evaluation, and explain why manual
            computation is needed despite auto-calculation.

Scope: frontend — remove confusing form fields or add clear labels explaining
the workflow. Backend — clarify scorecard computation logic.

Do not touch: scorecard calculation itself (system-owned, not a bug).

Verify: (a) scorecard page is clear on what employee must do vs. what's
automated, (b) no redundant input fields, (c) documentation explains the
workflow.
```

---

## BUG-BN — Sprints page has no search bar for finding specific sprints

**Where:** Employee → Sprints page

```
Fix: page displays many sprint cards with no way to search or filter them.
User must scroll through all cards to find a specific sprint, poor UX for
large sprint lists.

Expected: add a search bar above the sprint cards that allows filtering by:
  - Sprint name
  - Status (Active, Planning, Completed, Cancelled)

This makes navigation easy even with many sprints.

Scope: frontend — add search/filter component. Backend — provide search
endpoint if needed.

Do not touch: sprint listing or display logic.

Verify: (a) search bar appears at top of Sprints page, (b) typing filters
cards by name, (c) status filter works, (d) results update in real-time.
```

---

## BUG-BO — Sprint board is not responsive on smaller screen sizes

**Where:** Employee → Sprint Board (all screen sizes)

```
Fix: sprint board (kanban-style columns) doesn't adapt to smaller screens,
causing horizontal scrolling and poor UX on mobile/tablet.

Expected: make sprint board responsive:
  - On desktop (1920px+): show all columns side-by-side
  - On tablet (768-1024px): stack columns or use horizontal scroll with
    better touch controls
  - On mobile (< 768px): single-column view or drawer navigation for each
    column

Scope: frontend CSS/responsive design — update sprint board layout to use
media queries or CSS Grid with auto-flow.

Do not touch: sprint data or columns logic.

Verify: (a) on mobile (375px width), board is usable, (b) on tablet, board
adapts well, (c) on desktop, full board is visible, (d) no horizontal
scroll issues, (e) touch interactions work on mobile.
```

---

## BUG-BP — Sprint board has no way for employee to see which tasks are assigned to them

**Where:** Employee → Sprint Board

```
Fix: employee can see all sprint tasks in the kanban board, but there's no
visual indicator or filter to show only their assigned tasks. They have to
manually scan the board to find their work.

Expected: add a feature to the sprint board:
  OPTION A: Filter toggle: "Show All" vs. "Show My Tasks" at the top
  OPTION B: Visual badge/highlight on cards assigned to the logged-in user
  OPTION C: Sidebar filter for showing only user's tasks

This makes it immediately clear what the employee needs to work on.

Scope: frontend — add filter/highlight component to sprint board. Backend —
ensure task assignment data is available in API response.

Do not touch: task assignment logic or sprint workflow.

Verify: (a) sprint board has a way to filter/show only employee's tasks, (b)
clicking toggle shows/hides non-assigned tasks, (c) all employee's assigned
tasks are visible, (d) works across multiple sprints.
```

---

## BUG-BQ — Sprint board has empty space that should be filled with content

**Where:** Employee → Sprint Board (right side of kanban columns)

```
Fix: the sprint board kanban has empty space on the right side, wasting
screen real estate. Content feels cramped and incomplete.

Expected: fill the empty space with useful content:
  - Sprint summary metrics (tasks completed, burndown, velocity)
  - Assigned tasks quick view or sidebar
  - Sprint goals/notes
  
OR expand the kanban columns to fill the space more naturally.

Scope: frontend layout — add sidebar component or expand columns to fill
the space.

Do not touch: kanban column logic or tasks data.

Verify: (a) empty space is filled with content or expanded naturally, (b)
layout looks balanced, (c) usable on widescreen monitors.
```

---

## BUG-BR — Sprint board doesn't account for role-specific task types or views

**Where:** Employee → Sprint Board (roles only show "Employee")

```
Fix: the role/title field only shows generic "Employee". For a development
team, there should be different roles (Software Developer, Frontend
Developer, Backend Developer, Project Coordinator) with potentially different
task views or filters.

Expected: update system to support role-based sprint board views:
  - Add role types: Software Developer, Frontend Developer, Backend Developer,
    Project Coordinator, etc.
  - Optionally filter sprint board by role (e.g., show only backend dev tasks
    if user is a backend dev)
  - Ensure roles are assigned during user onboarding/admin management

Scope: backend — add role types to user model. Frontend — display role and
optionally filter sprint board by role.

Do not touch: existing Employee role or basic sprint logic.

Verify: (a) users can have different roles (not just Employee), (b) roles are
displayed, (c) sprint board optionally filters by role (if applicable), (d)
roles are assigned during user creation.
```

---

## BUG-BS — Report a Bug page content is left-aligned instead of centered

**Where:** Employee → Report a Bug page

```
Fix: the form content is aligned to the left side of the page, leaving empty
space on the right. Creates unbalanced visual layout.

Expected: center-align the form content so it's balanced on the page,
especially for light-content pages.

Scope: frontend CSS/layout — center the form wrapper or use max-width and
auto margins.

Do not touch: form content or functionality.

Verify: (a) form is centered on the page, (b) looks balanced on widescreen,
(c) still responsive on mobile, (d) no functionality changes.
```

---

## BUG-BT — Page layouts lack consistency across all employee pages

**Where:** Employee → All pages (Dashboard, Projects, Time Clock, Outputs, etc.)

```
Fix: different pages use different layout patterns (left-aligned, centered,
full-width) with inconsistent spacing, padding, and alignment. This breaks
the user's mental model of the application.

Expected: establish and apply consistent layout patterns across ALL employee
pages:
  - Header (title + subtitle)
  - Quick Action buttons (if applicable)
  - Summary cards (if applicable)
  - Main content table/form (centered or constrained width)
  - Footer/pagination (if applicable)
  
All pages should follow the same structure and spacing rules for visual
consistency.

Scope: frontend — audit all employee pages and apply consistent CSS/layout
patterns. Create a layout template/component if needed.

Do not touch: page content or data.

Verify: (a) all employee pages follow same header/footer pattern, (b) spacing
and padding are consistent, (c) content width is consistent, (d) centering
is consistent, (e) no jarring layout changes when navigating.
```

---

## Suggested order

These bugs focus on UX/layout/navigation. Do them in dependency order: high-impact workflow unifications first, then form/field improvements, then layout consistency cleanup.

**HIGH IMPACT (Workflow Unification):**
1. **BUG-BF** (Time Clock + Timesheet unified — foundation)
2. **BUG-BG** (Outputs modal/collapsible form — clears screen)
3. **BUG-AV** (Notification popover + page — enables discovery)
4. **BUG-AW** (Settings sidebar redundancy — cleans nav)

**MEDIUM-HIGH (Navigation/Page UX):**
5. **BUG-BN** (Sprints page search — findability)
6. **BUG-AX** (Dashboard empty state — clarity)
7. **BUG-AY** (Dashboard employee-centric KPIs — relevance)
8. **BUG-AZ** (Dashboard quick actions — daily friction)
9. **BUG-BA** (Dashboard Recent Projects → My Tasks — focus)
10. **BUG-BB** (Projects empty state — clarity)

**MEDIUM (Form/Field UX):**
11. **BUG-BH** (Outputs auto-populate project — convenience)
12. **BUG-BI** (Outputs hide manager fields — clarity)
13. **BUG-BJ** (Outputs Linked Time Entry dropdown — UX)
14. **BUG-BC** (Projects disable filters when empty — UX)
15. **BUG-BD** (Projects table centering — layout)
16. **BUG-BE** (Projects helper button — navigation)

**MEDIUM-LOW (Sidebar/Navigation Cleanup):**
17. **BUG-BK** (Outputs sidebar consolidation)
18. **BUG-BL** (Time Clock sidebar consolidation)

**LOW (Responsive/Roles/Design Clarification):**
19. **BUG-BO** (Sprint board responsive design)
20. **BUG-BP** (Sprint board show my tasks — filtering)
21. **BUG-BQ** (Sprint board empty space — layout)
22. **BUG-BR** (Sprint board role types — configuration)
23. **BUG-BM** (Scorecards design clarification — workflow)

**COSMETIC (Layout Consistency):**
24. **BUG-BS** (Report a Bug page centering)
25. **BUG-BT** (Global layout consistency — audit & apply)

---

## PHASE 3 SUMMARY

25 UX/user journey bugs focused on:
- Workflow unification (Time Clock, Outputs)
- Navigation clarity (Settings, Sprints search)
- Page consistency (layout, centering, spacing)
- Form/field UX (auto-populate, helper dropdowns)
- Responsive design (Sprint board)
- Role-based features (Sprint board roles)

All changes must maintain consistency across pages per QA feedback.
