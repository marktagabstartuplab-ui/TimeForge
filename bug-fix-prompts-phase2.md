# TimeForge Bug Fix Prompts — Phase 2

Source: `TimeForge (2).docx` — 12 high/medium-impact defects (BUG-AE–BUG-AP), prioritized by workflow impact.

**How to use this:** Same format as Phase 1. Run one bug at a time in fresh sessions, follow the shared rules at the top, verify each fix before moving to the next. These bugs have dependencies within the Daily Scrum workflow — sequence them carefully.

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

## BUG-AE — Daily Scrum remains editable after being saved and locked

**Where:** Employee → Daily Scrum (after clicking Save)

```
Fix: after saving and locking the Daily Scrum, input fields and edit
buttons remain active. The form should be completely read-only once
submitted.

Expected: clicking Save/Submit locks the Daily Scrum. All form fields
become read-only/disabled. Edit buttons disappear. User cannot modify
the submission unless it's reopened via a supervisor unlock (BUG-AH).

Scope: frontend — disable all form inputs when status is locked.
Backend — API endpoint must reject any update request for locked records
(return 403 Forbidden if someone tries to update).

Do not touch: the unlock workflow (BUG-AH) — this is purely about
making locked records read-only.

Verify: (a) save a Daily Scrum, (b) all input fields are now disabled/
read-only, (c) edit buttons are hidden, (d) attempting to submit an
update directly (API call) is rejected with 403, (e) a non-locked scrum
still allows editing normally.
```

---

## BUG-AF — Quick Select fails to populate; missing carry-over for uncompleted EOD tasks

**Where:** Employee → Daily Scrum → Quick Select section and End of Day Review

```
Fix: two issues:
  1. Clicking a task in Quick Select doesn't auto-fill the Daily Scrum
     fields (feature is broken).
  2. Tasks marked "Yes" to "Will you continue this tomorrow?" in the
     previous EOD review don't auto-populate in Quick Select the next
     day (workflow gap).

Expected:
  1. Quick Select items become clickable — clicking one auto-fills the
     corresponding Daily Scrum fields.
  2. Quick Select displays "Continued Tasks" from the previous day's EOD
     (tasks the user said they'd continue). These appear prominently.

Scope: frontend — fix the click handler for Quick Select, update UI to
show carried-over tasks. Backend — query the previous day's EOD
submission to fetch tasks marked for continuation and return them to
today's Daily Scrum view.

This blocks legitimate workflow — users lose continuity between days.

Verify: (a) click a Quick Select task and confirm it auto-fills fields,
(b) mark a task "continue tomorrow" in EOD, (c) next day's Quick Select
shows this task in a "Continued" section, (d) clicking it adds it to
today's commitments.
```

---

## BUG-AG — Work Details and Daily Plan input fields not cleared after save

**Where:** Employee → Daily Scrum → Work Details and Daily Plan sections

```
Fix: after clicking "Save Work Details" or "Save Daily Plan", the
entered values remain in the input fields instead of being cleared.
This causes confusion about whether the data was saved and risks
duplicate submissions.

Expected: after a successful save:
  - All input fields reset to empty/default
  - Attachments and links are cleared
  - Success message displays
  - Form is ready for the next entry

Scope: frontend — the save handlers for both Work Details and Daily Plan
should reset the form state after a successful API response.

Do not touch: the save/submission logic itself — this is just the
post-save cleanup.

Verify: (a) fill in Work Details, click Save, confirm all fields clear
and success message shows, (b) same for Daily Plan, (c) test with
attachments — confirm they clear too, (d) failed saves do NOT clear the
form (so user doesn't lose data).
```

---

## BUG-AH — Missing supervisor permission workflow to unlock and edit Daily Scrum

**Where:** Employee → Daily Scrum (after lock) and Supervisor → Dashboard

```
Fix: once a Daily Scrum is locked, there's no way for an employee to
request edit access, nor for a supervisor to grant it. Employee is stuck
with a locked submission even if they need to make corrections.

Expected: workflow:
  1. Daily Scrum is locked (read-only).
  2. Employee clicks "Request Edit" button.
  3. Supervisor receives a notification/dashboard item.
  4. Supervisor clicks "Unlock" or "Grant Permission".
  5. Employee can now edit the locked Scrum for a limited time/until
     re-submission.
  6. After re-submission, it locks again.

Scope: frontend — add "Request Edit" button to locked Scrum view.
Backend — new permission state (locked vs. unlocked-for-edit), new
notification/request workflow, permission check on the update endpoint.

Do not touch: the basic lock functionality (BUG-AE) — this is the
supplementary unlock-request workflow.

Verify: (a) lock a Daily Scrum, (b) "Request Edit" button appears, (c)
clicking it sends a request to supervisor, (d) supervisor sees the
request and can unlock, (e) employee can now edit temporarily, (f) re-
submitting re-locks it.
```

---

## BUG-AI — Missing confirmation prompt before locking Daily Scrum and EOD Review

**Where:** Employee → Daily Scrum (Save button) and End of Day Review (Submit button)

```
Fix: clicking Save/Submit instantly locks the record. No confirmation,
no safety net for accidental clicks.

Expected: clicking the final Save/Submit button shows a confirmation
modal: "Are you sure you want to submit? This action will lock your
entry and you will not be able to edit it afterward. Click Yes to
confirm."

Only proceeds if user clicks Yes. Cancel dismisses the modal.

Scope: frontend — intercept the save/submit click, show a confirmation
modal before dispatching the API call.

Do not touch: the lock/submission logic — this is just a UX safety net
before it happens.

Verify: (a) click Save on Daily Scrum, (b) confirmation modal appears,
(c) clicking Cancel dismisses modal without saving, (d) clicking Yes
proceeds with save and lock, (e) same behavior for EOD Review, (f)
existing saved data is unaffected.
```

---

## BUG-AJ — Missing autofill linkage between Plan New Task and Work Details

**Where:** Employee → Daily Scrum (Plan New Task vs. Work Details sections)

```
Fix: when a user creates a commitment in "Plan New Task", they must
manually re-type that task again in the "Work Details" section. Data
should auto-carry-over to reduce duplication.

Expected: after successfully adding a task via "Plan Commitment Task",
one of:
  1. The task auto-populates in the Work Details Task field, OR
  2. The task appears as a quick-select chip in Work Details so user
     can add it with one click.

Scope: frontend state management — pass the committed task data from the
Plan section to the Work Details component.

Do not touch: the planning or details storage logic — this is purely
about pre-filling the form from existing data.

Verify: (a) add a task via Plan New Task, (b) Work Details Task field
is now pre-filled OR shows the task as a quick-select option, (c)
clicking auto-selects it, (d) user can still manually enter a different
task if needed.
```

---

## BUG-AK — AI Draft Scrum feature ignores Today's Commitments data

**Where:** Employee → Daily Scrum → AI Daily Standup Composer

```
Fix: the "Draft Scrum" AI button generates a generic response because
it's not receiving the user's Today's Commitments list as input.

Expected: clicking "Draft Scrum" collects the tasks from Today's
Commitments and sends them to the AI endpoint. AI uses those specific
tasks to draft an accurate, personalized scrum report.

Scope: frontend — include the commitments array in the API payload when
calling the AI endpoint. Backend — update the AI system prompt to
explicitly ingest and format the provided task data into the draft.

Do not touch: the AI service itself — just wire up the data flow.

Verify: (a) add tasks to Today's Commitments, (b) click "Draft Scrum",
(c) generated draft includes mentions of your specific tasks (not
generic), (d) draft quality improves with better task data.
```

---

## BUG-AL — Quick Select tasks automatically load into Work Details instead of preview modal

**Where:** Employee → Daily Scrum → Quick Select (Suggested/Recent Tasks)

```
Fix: clicking a Quick Select task immediately populates the Work
Details section with no preview/confirmation. This interrupts the
employee's current work session.

Expected: clicking a Quick Select task opens a modal showing task
details (Task Name, Project, Description, Expected Output, KPI, Planned
Target, etc.). Modal has:
  - "Load Task" button — populates Work Details
  - "Cancel" button — dismisses without changing current Work Details

Current Work Details remain unchanged until employee explicitly
confirms.

Scope: frontend — add task preview modal component, wire Quick Select
clicks to open it instead of auto-loading.

Do not touch: the Quick Select population logic (BUG-AF) — this is just
the interaction flow.

Verify: (a) click a Quick Select task, (b) modal opens with task
details, (c) Work Details unchanged, (d) clicking Cancel closes modal
without changes, (e) clicking Load Task populates Work Details, (f)
current unsaved Work Details data is preserved if Load is cancelled.
```

---

## BUG-AM — AI-generated task text exceeds input field's length limit

**Where:** Employee → Daily Scrum → Work Details → Task section (with "Improve with AI")

```
Fix: clicking "Improve with AI" generates text that exceeds the Task
field's max character/word limit, causing validation errors or
truncation.

Expected: AI prompt includes strict length constraints (e.g., "Keep
response under 150 words"). Generated text always fits within the field
limit without requiring manual editing.

Scope: backend/AI integration — update the system prompt sent to the AI
service to enforce the word/character limit. Frontend — validate and
warn if injected text somehow still exceeds limit.

Do not touch: the "Improve with AI" button itself — just fix the output
constraints.

Verify: (a) click "Improve with AI" on a task, (b) generated text fits
in the field without truncation or validation errors, (c) text is still
useful/improved, (d) user can submit immediately without editing.
```

---

## BUG-AN — Missing "Improve with AI" button on Deliverables input field

**Where:** Employee → Daily Scrum → Description & Links category

```
Fix: "Work Description" has an "Improve with AI" button, but
"Deliverables" directly below it doesn't. Feature parity missing.

Expected: "Deliverables" field also has an "Improve with AI" button that
uses an AI prompt tailored for formatting concise, tangible outputs
(bullet points of completed assets, PRs, etc.).

Scope: frontend — add the button component to the Deliverables field.
Backend/AI — wire it to the AI service with a specific prompt for
deliverables.

Do not touch: the Work Description AI button — this is just adding the
same pattern to Deliverables.

Verify: (a) "Improve with AI" button now appears on Deliverables field,
(b) clicking it generates concise, formatted output suitable for
deliverables, (c) no validation errors.
```

---

## BUG-AO — Redundant "Actual Completed" input field in Today's Commitments

**Where:** Employee → Daily Scrum → Today's Commitments section

```
Fix: inside task cards in Today's Commitments, there's an "ACTUAL
COMPLETED" input field. This duplicates data capture that happens in
the EOD Review, cluttering the interface.

Expected: remove the "Actual Completed" input field from Today's
Commitments task cards entirely. Employees plan here, log actuals only
during EOD Review.

Scope: frontend UI — remove the input component from the task card.

Do not touch: the EOD Review's Actual Completed field (BUG-O from Phase
1) — that one stays.

Verify: (a) "Actual Completed" field no longer appears on task cards in
Today's Commitments, (b) EOD Review still has its own Actual Completed
input, (c) no data loss from existing submissions.
```

---

## BUG-AP — Unnecessary action buttons in Today's Commitments

**Where:** Employee → Daily Scrum → Today's Commitments section

```
Fix: the task cards in Today's Commitments display "Edit", "Complete",
and "Delete" buttons that shouldn't be accessible from this view.

Expected: these action buttons should be completely removed from the
Today's Commitments UI. Commitments are planned here, completed only
during EOD Review.

Scope: frontend UI — hide/remove the Edit, Complete, Delete button
components from the commitment card.

Do not touch: the ability to manage commitments elsewhere if such a
place exists — just clean up this specific view.

Verify: (a) no Edit, Complete, Delete buttons visible on task cards in
Today's Commitments, (b) task cards still show the commitment info (name,
target, etc.), (c) clicking a card doesn't trigger any edit action.
```

---

## Suggested order

Do these in isolation. Daily Scrum bugs (AE, AF, AG, AH, AI, AJ, AK) are clustered; do them as a group before moving to the standalone bugs (AL, AM, AN, AO, AP).

1. **BUG-AE** (Daily Scrum lock enforcement — foundation)
2. **BUG-AH** (Supervisor unlock workflow — pairs with AE)
3. **BUG-AI** (Confirmation before lock — safeguards AE)
4. **BUG-AF** (Quick Select + EOD carry-over — workflow critical)
5. **BUG-AG** (Form clearing after save — data integrity)
6. **BUG-AJ** (Autofill Plan → Details — UX friction)
7. **BUG-AK** (AI uses commitment data — feature completeness)
8. **BUG-AL** (Quick Select preview modal — workflow interruption)
9. **BUG-AM** (AI text length constraint — validation)
10. **BUG-AN** (Add AI button to Deliverables — parity)
11. **BUG-AO** (Remove redundant Actual Completed — cleanup)
12. **BUG-AP** (Remove action buttons from Today's — cleanup)
