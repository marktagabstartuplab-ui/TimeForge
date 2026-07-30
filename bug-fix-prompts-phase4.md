# TimeForge Bug Fix Prompts — Phase 4

Source: working session on BUG-AM/BUG-AN (2026-07-30). Both tickets came out of
the page's *structure* rather than any single broken control — nothing here
throws an error, but the Daily Scrum flow is hard to reason about.

**How to use this:** Same format as Phases 1–3. Run one bug at a time, follow
the shared rules from `bug-fix-prompts-phase3.md`, verify each before moving on.

---

## Context that explains both tickets

The Daily Scrum page writes to **three separate records**, with nothing on
screen telling the employee so:

| Zone | Control | Writes to |
|------|---------|-----------|
| Plan New Task | `+ Plan Commitment Task` | `ScrumTask` rows — today's intent |
| Work Details | `Save Work Details` | the running `TimeEntry` — what this session was |
| Yesterday / Notes | `Save Daily Plan` | the `ScrumEntry` — the scrum record itself |

Three saves, three records, one undifferentiated page. Tasks and blockers also
persist *immediately* on their own, while yesterday/notes wait for an explicit
save — so "what is saved right now" is genuinely ambiguous.

---

## BUG-BU — "Task" means two different things on the same screen

**Where:** Employee → Daily Scrum → Plan New Task, and → Work Details

```
Fix: "Task Description" (Plan New Task) and "Task" (Work Details) sit on
the same screen with near-identical names, but write to different records
and mean different things. "Task Description" is a commitment you intend
to do today (becomes a ScrumTask row). "Task" is what the currently
clocked-in session actually was (a field on the TimeEntry). Employees
read them as the same field and fill them inconsistently.

Expected: the two fields are named so the difference is obvious without
reading help text. Suggested: Plan New Task → "Commitment"; Work Details
→ "What you worked on". Exact wording is open, the distinction is not.

Scope: frontend labels and placeholders only — ScrumTaskCard.tsx (the
planner form) and WorkDetailsCard.tsx (Work Details). Also update the
Quick Select preview modal if it echoes either label.

Do not touch: the underlying field names, DTOs, or DB columns — this is a
labelling change, not a schema change. Do not merge the two fields; they
are deliberately separate records.

Verify: (a) both fields, visible on one screen, are unambiguously
distinct, (b) no API payload changes, (c) existing entries still render
correctly.
```

---

## BUG-BV — Three save actions on one page with nothing marking their boundaries

**Where:** Employee → Daily Scrum (whole page)

```
Fix: the page has three independent save actions — "+ Plan Commitment
Task", "Save Work Details", and "Save Daily Plan" — each persisting a
different record. Nothing groups the fields belonging to each, so
employees can't tell which button commits which fields, or whether saving
one saves the others. Compounded by tasks and blockers persisting
immediately on their own while yesterday/notes wait for "Save Daily Plan".

Expected: three visually distinct zones, each with its own heading and its
save action inside it. Suggested framing: "Plan today" → "Log this
session" → "Submit your scrum". An employee should be able to tell,
without experimenting, what each button writes and what is still unsaved.

Scope: frontend layout and headings — TimeTrackingContent.tsx (page
composition), ScrumTaskCard.tsx, WorkDetailsCard.tsx. Grouping and
labelling only.

Do not touch: save logic, mutation order, autosave/draft behaviour, or
which fields belong to which record. Do not consolidate the three saves
into one — they write to three different records and must stay separate.

Verify: (a) each save button sits inside a visually bounded zone with its
own heading, (b) unsaved-state indicators are scoped to their own zone,
(c) all three saves behave exactly as before.
```

---

## Suggested order

Both are UX clarity — no logic change, no schema change. Sequence BU → BV: the
renaming is small and removes the sharpest confusion, and doing it first means
the regrouping work already has the right words to group under.

**Related, already fixed** (on `fix/quick-select-task-preview`):

- The AI Standup Composer wrote its whole-day "Today" summary into the planner's
  Task Description, which becomes a single `ScrumTask.title` — producing
  paragraph-length task titles, and circular besides, since the composer is fed
  those same commitments. It now proposes discrete commitments (title /
  expected output / measurement) that are accepted individually and persist as
  real ScrumTask rows.
