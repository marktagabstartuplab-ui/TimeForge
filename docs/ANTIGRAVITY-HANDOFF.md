# TimeForge — Handoff Prompts for Antigravity (Opus 4.6) / OpenCode

This is a **chunked handoff** for continuing TimeForge development in a fresh agent session after the
previous Claude Code session ran out of context/usage. The chunk prompts below are tool-agnostic plain
text — they work the same whether pasted into Antigravity, OpenCode, or any other chat-style coding agent.

**Tool-specific note:** if you're using **OpenCode**, it auto-loads `AGENTS.md` at the repo root every
session, which already covers everything in Prompt 0 below — so Prompt 0 is optional there (still fine
to paste if you want an explicit confirmation step). If you're using **Antigravity** or anything else
without an AGENTS.md convention, paste Prompt 0 first, manually.

**How to use this file:**
1. (Antigravity/other) Paste **Prompt 0 (Orientation)** first, in a new session, before anything else.
   (OpenCode) `AGENTS.md` already did this — skip straight to Chunk 1, or paste Prompt 0 anyway for a
   sanity-check confirmation.
2. Then paste **Chunk 1**. Let the agent finish, review its work, then paste **Chunk 2**, and so on.
3. Each chunk prompt is self-contained (works even if pasted into a brand-new session with no memory
   of the others) but assumes either Prompt 0 or `AGENTS.md` has established orientation first.
4. After each chunk lands, tell the agent to update the alignment table in `README.md` before moving on —
   this is baked into every chunk prompt below, don't skip it.

---

## Prompt 0 — Orientation (paste first, once per new session)

```
You're picking up work on TimeForge, a multi-tenant workforce management platform
(NestJS + Next.js 16 + Prisma/Postgres + Redis/BullMQ). A previous agent session did a large
amount of work here and ran out of context before finishing everything. Before doing anything else:

1. Read C:\Users\USER\Claude\Projects\TImeForge\README.md in full — especially the "Project brief
   alignment" table and "Gotchas for future agents" section. That table is the current source of
   truth for what's done vs. what's left; don't re-audit the codebase from scratch.
2. Read C:\Users\USER\Downloads\Project Brief - TimeForge.pdf if you need the original client
   requirements in full (the README already summarizes the relevant parts).
3. Do NOT start building yet. Just confirm back to me: what's already complete, what's partial,
   and what the prioritized gap list is, in your own words, so I know you've actually absorbed it.

Ground rules for all work in this repo (already established conventions — follow them exactly):
- Reuse existing modules/services; don't duplicate. Check apps/api/src/modules/* and
  apps/web/features/* for something similar before writing new code.
- Real data only — no mock/placeholder values, no hardcoded fake numbers in "finished" features.
- Every mutating action on payroll/HR/audit-sensitive data must write an AuditLog entry and,
  where relevant, a Notification — match the existing pattern (see PayrollService, ScrumService).
- RBAC: every new endpoint needs @RequirePermissions; check packages/shared/src/permissions.ts
  for existing permission constants before inventing new ones.
- Multi-tenant: every Prisma query must be scoped by tenantId (+ organizationId where applicable).
- No new sidebar items or nav changes without checking apps/api/src/modules/navigation/navigation.service.ts's
  existing role-scoping pattern first (read the inline comments — this file has subtle role-vs-permission
  gotchas already documented there).
- Currency is PHP (₱), never $.
- When a chunk is done: verify it live (start the dev servers, log in as the relevant seeded role,
  click through it) before reporting it complete. Seeded logins are in the README.
- Update the README's alignment table + gap list to reflect what you just finished, in the same
  piece of work — don't leave it stale for the next session.

Reply with your understanding of current state and the gap list, then stop and wait for me to
paste the next chunk.
```

---

## Chunk 1 — Time entry attachments (real file upload)

```
Context: TimeForge's Time Tracking module is missing real file-upload attachments on time entries —
this was called out explicitly in the client brief and is a literal TODO in the code today
(apps/web/features/time-tracking/components/WorkDetailsCard.tsx, look for the attachments/upload
comment). Only URL-based "Reference Links" currently work.

Task: implement real Supporting Attachments on time entries, end to end.

Investigate first (don't assume — verify against current code):
- apps/api/src/modules/storage/ — there's an existing StorageService (Supabase Storage wrapper)
  already used elsewhere (e.g. payroll export processors, user avatars). Reuse it, don't build a
  new storage integration.
- prisma/schema.prisma — check the TimeEntry model for any existing attachment-related field
  (e.g. a JSON column) before assuming you need a new table/migration.
- apps/web/features/time-tracking/components/WorkDetailsCard.tsx — read the existing TODO comment
  and surrounding code for what the frontend already expects from an attachments endpoint.

Build:
- Backend: an upload endpoint (or extend the existing time-entry create/update endpoint) that
  accepts a file, stores it via StorageService, and persists a reference (key + filename + size)
  on the TimeEntry. Add a way to list/download attachments for a given entry (signed URL, matching
  the pattern used elsewhere for signed downloads).
- Frontend: wire the existing attachments UI slot in WorkDetailsCard.tsx to actually upload/list/
  remove files against the real endpoint, replacing the TODO.
- RBAC: employees can attach files to their own entries; supervisors/HR/admin can view but not
  necessarily upload to others' entries — check existing time-entry permission scoping and match it.
- Migration: only add one if the schema truly needs a new field/table — check first.

When done: verify live as employee@demo.test — create a time entry, attach a file, reload the page,
confirm the attachment persists and downloads correctly. Then update README.md: mark Time Tracking's
attachments gap as resolved in the alignment table (it may still be ⚠️ if Task/Department/Deliverables
are still missing — only mark the attachments part done, don't overstate it).
```

---

## Chunk 2 — AI Configuration admin screen

```
Context: the client brief lists "AI configurations" as an Administrator responsibility. TimeForge's
AI system (BullMQ-backed, OpenAI provider with stub fallback) is fully functional, but there is
currently NO admin UI to configure it — no way to see/change provider, model, or feature toggles
without editing code/env vars directly.

Task: build a minimal but real AI Configuration screen for Admins.

Investigate first:
- apps/api/src/modules/ai/ — read ai.service.ts and ai.controller.ts to understand the current
  AiFeature enum, provider abstraction, and whether config is currently just env-var driven
  (OPENAI_API_KEY etc.) or if there's already a settings table you're missing.
- apps/api/src/modules/organization/ — check if OrgSettings or similar already has a JSON config
  blob that could reasonably hold AI settings, before creating a whole new table.
- apps/web/features/settings/ — existing admin settings UI conventions to match (forms, save
  patterns, toast usage).

Build (keep scope realistic — this doesn't need to support hot-swapping providers, just visibility
and the few things that are genuinely configurable):
- A settings section (new or extending an existing OrgSettings-style model) exposing: which AI
  features are enabled/disabled per organization, and read-only visibility into which provider mode
  is active (live OpenAI vs. stub fallback — don't expose the API key itself).
- An admin-only endpoint + UI to toggle features on/off. Persist it and have the AI trigger endpoints
  actually respect the toggle (don't just store it decoratively — wire it into whichever service
  currently allows triggering an AI job, so a disabled feature genuinely can't be triggered).
- RBAC: Admin only.

When done: verify live as admin@demo.test — toggle a feature off, confirm triggering that AI job now
fails/is blocked; toggle it back on, confirm it works again. Update README.md: mark the Admin Portal
AI-configuration gap as resolved.
```

---

## Chunk 3 — Task as a real field on time entries

```
Context: the client brief requires each time entry to capture a "Task" as its own field. Today it's
smuggled into the free-text description (apps/web/features/time-tracking/components/WorkDetailsCard.tsx
prepends task text into the description string rather than storing it separately).

Task: promote Task to a real, queryable field.

Investigate first:
- prisma/schema.prisma — check the TimeEntry model and also check if a "Task" concept already
  exists elsewhere in the schema (e.g. ScrumTask) that should be reused/linked rather than
  duplicated. Decide: is a Task a free-text field on TimeEntry, or should it reference a real
  Task/ScrumTask entity? Prefer the simplest option that satisfies the brief unless there's already
  a clear existing Task entity begging to be reused.
- apps/api/src/modules/timesheets/ — check how TimeEntry rows currently roll up into timesheets/
  reports, to make sure adding a field doesn't break existing aggregation.

Build:
- Add the Task field (migration if needed) to TimeEntry.
- Update the create/update time-entry endpoints and DTOs.
- Update WorkDetailsCard.tsx (and any other time-entry form) to capture Task as its own input,
  no longer folded into description.
- Update any reports/exports that render time entries to show Task as its own column where relevant
  (check apps/worker/src/processors/ and apps/web/features/reports/ for existing time-entry tables).

When done: verify live — create a time entry with a distinct Task value and Description, confirm
both persist and display separately, not concatenated. Update README.md alignment table.
```

---

## Chunk 4 — Department on time entries

```
Context: lowest priority of the remaining gaps. The brief wants Department captured per time entry;
today it only exists on the User's profile (departmentId), so entries are attributed to whatever
department the user currently belongs to, not necessarily the department the work was done for.

Task: add an optional per-entry Department override.

Investigate first:
- prisma/schema.prisma — TimeEntry model, Department model, and how department is already
  threaded through timesheets/reports (search for departmentId usage across
  apps/api/src/modules/timesheets and dashboard-reports — many reports already group by
  user.department; decide whether they should prefer the entry-level department when present).

Build:
- Add an optional departmentId field to TimeEntry (nullable — defaults to null, meaning "use the
  user's profile department" for backward compatibility with existing rows/reports).
- Update the time-entry form to let the user pick a department (defaulting to their own), reusing
  the existing department-picker pattern already used in Schedules
  (apps/web/features/schedules/api/departments-picker.service.ts).
- Update report/aggregation logic that currently reads user.department to prefer entry.departmentId
  when set, falling back to user.department otherwise — audit dashboard-reports/dashboard.service.ts
  and attendance-reports for the specific spots.

When done: verify live — log a time entry against a different department than your own profile,
confirm it shows correctly attributed in at least one department-grouped report. Update README.md.
```

---

## Chunk 5 — Recurring-blocker detection & open-ended KPI metric types (stretch)

```
Context: two smaller, lower-urgency polish items bundled together since they're both "nice-to-have
depth" rather than missing functionality.

Part A — Recurring blocker detection: today, a supervisor can only manually flag a single scrum
entry as a "recurring issue" (apps/api/src/modules/scrum/scrum.service.ts flagScrumEntry). There's
no automatic surfacing of a blocker that's shown up across multiple days for the same employee.
Investigate the ScrumEntry/blockers data model, then add a real (non-AI, rules-based) signal: e.g. a
supervisor-facing indicator when the same employee has reported a blocker on 3+ of their last 5
entries. Surface it in the existing Team Scrum Submissions page
(apps/web/features/scrum-management/components/TeamScrumSubmissionsContent.tsx) as a badge/flag,
not a new page.

Part B — Open-ended KPI metric types: KpiTemplate.metricType is currently a fixed enum (COUNT,
HOURS, PERCENT, CURRENCY). Investigate apps/api/src/modules/kpi/kpi.service.ts and the KpiTemplate
model — decide whether the brief's examples (features completed, bugs resolved, campaigns launched,
design outputs, docs completed, sales opportunities) are actually already covered by COUNT, or if
there's a genuine gap. If COUNT already covers all the brief's examples, DO NOT do speculative work
here — just confirm in your report that this item was a non-issue and move on. Only add real schema
flexibility if you find a concrete example the current enum can't express.

When done: verify Part A live (create scrum entries with repeated blockers for a seeded employee,
confirm the supervisor view flags it). Update README.md to close out the gap list — at this point
the alignment table should have very few ⚠️/❌ rows left; if anything is still open, leave it
explicitly documented rather than silently dropped.
```
