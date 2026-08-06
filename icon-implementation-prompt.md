# TimeForge Icon Implementation Prompt

**Implementation guide for icon color consistency across all icon categories.**

Use this prompt **before starting each icon bug (BUG-AH-1 through BUG-AH-7)**.

> **Revised 2026-08-05** against the actual codebase. The previous version of this
> file targeted `feather-icons-react` and `apps/web/app/<module>/components/*`
> paths — neither exists in this repo. See [Ground truth](#ground-truth) before
> trusting any older copy of this doc.

---

## Ground truth

Everything below was verified against the working tree. Do not re-derive it.

| Assumption in the old guide | Reality |
|---|---|
| `feather-icons-react` | **Not installed.** `apps/web` uses **`lucide-react` ^1.22.0** (156 files import it). Lucide is a fork of Feather — nearly every icon name maps over. |
| `apps/web/app/<module>/components/*` | Feature code lives in **`apps/web/features/<feature>/components/*`**. `apps/web/app/*` holds route entries only. |
| `modules/<x>/components/*` | No `modules/` directory exists. |
| PRIMARY = `#0066CC` | Brand primary is **`#2563eb`** (`--brand` / `--primary` in `app/globals.css`). `#0066CC` would fight the design system. |
| Sidebar sections WORK / APPROVALS / HR / REPORTS / ADMIN / SUPPORT | Real sections are **WORKSPACE, MANAGEMENT, FINANCE_REPORTS, FINANCE, SYSTEM, SUPPORT**. |
| `components/StatusBadge.tsx` | Exists at **`apps/web/components/shared/StatusBadge.tsx`** and already has a `BadgeTone` system (`neutral \| info \| success \| warning \| danger \| brand`). Extend it — don't replace it. |
| `components/Alert.tsx`, `components/ValidationError.tsx`, `components/NotificationBadge.tsx`, `components/SummaryCards.tsx`, `components/LeaveCard.tsx` | **None exist.** |
| Leave types VACATION / SIL / MATERNITY / PATERNITY / BEREAVEMENT | `LeaveType` in `prisma/schema.prisma:117` is **`ANNUAL \| SICK \| PERSONAL`** only. |
| Attendance statuses PRESENT / LATE / ABSENT / ON_LEAVE | **Not in code anywhere** — they appear only in planning markdown (`hr-attendance-schedule-improvements.md`, `feature-build-prompts.md`). BUG-AH-1 is blocked on that feature landing. |
| Inline `style={{ color: '#hex' }}` | The app is **Tailwind v4** with `@theme` tokens and a `.dark` variant already wired up. Inline hex bypasses both and breaks dark mode. Use classes. |
| `npm run test` covers this | Root `npm test` is **backend Jest only**. `apps/web` has **no test runner** — its only gates are `tsc` and `eslint`. |

### Real shared components

`apps/web/components/shared/` — `StatusBadge` · `Toast` · `StatCard` · `MetricCard` ·
`DataTable` · `EmptyState` · `ErrorState` · `PageHeader` · `ProgressBar` ·
`ProgressRing` · `SectionCard` · `SearchInput` · `Pagination` · `Avatar` ·
`ConfirmationDialog` · `PesoIcon` · `AiFormattedText` · `WeeklyHoursChart`

`apps/web/components/ui/` — shadcn primitives (button, card, dialog, select, …).

`MetricCard` already exposes the exact pattern this whole effort wants:

```tsx
/** Tint behind the icon box, e.g. "bg-brand-cyan/15 text-brand". */
iconTone?: string;
```

That prop is the intended seam for card/widget icon tinting. `StatCard` hardcodes
`text-brand` and has no equivalent — adding one is in scope for BUG-AH-7.

---

## Feather → Lucide name map

Every icon named in `icon-color-system.md`, translated to its `lucide-react` export:

| Feather (doc) | Lucide import | Notes |
|---|---|---|
| `check-circle` | `CheckCircle2` | `CheckCircle` also exists; the codebase already uses `CheckCircle2` in `Toast.tsx` — match it |
| `alert-circle` | `AlertCircle` | |
| `x-circle` | `XCircle` | |
| `alert-triangle` | `AlertTriangle` | |
| `info` | `Info` | |
| `calendar` | `Calendar` | nav uses `CalendarDays` / `CalendarClock` |
| `play-circle` | `PlayCircle` | |
| `stop-circle` | `StopCircle` | |
| `clock` | `Clock` | nav uses `Timer` for Daily Scrum |
| `check` | `Check` | |
| `x` | `X` | |
| `send` | `Send` | |
| `refresh-cw` | `RefreshCw` | |
| `briefcase` | `Briefcase` | |
| `inbox` | `Inbox` | |
| `users` | `Users` | |
| `bar-chart-2` | `BarChart2` | **nav already uses `BarChart3`** — keep `BarChart3` there |
| `settings` | `Settings` | nav uses `SlidersHorizontal` for settings routes |
| `life-buoy` | `LifeBuoy` | |
| `edit-2` | `Pencil` | Lucide dropped `Edit2`; `SquarePen` is the other option |
| `trash-2` | `Trash2` | |
| `eye` | `Eye` | |
| `download` | `Download` | |
| `upload` | `Upload` | |
| `plus` | `Plus` | |
| `coffee` | `Coffee` | |
| `star` | `Star` | |
| `umbrella` | `Umbrella` | |
| `activity` | `Activity` | |
| `user` | `User` | |
| `heart` | `Heart` | |
| `target` | `Target` | |

Sizing: lucide takes `size={18}` **or** Tailwind classes. This codebase consistently
uses classes (`className="h-4 w-4"`). Match that.

---

## Shared rules (paste at the start of each icon bug)

```
BEFORE I START CODING:

1. Scope & Safety:
   ☐ I've read icon-color-system.md and the Ground truth table above
   ☐ I've listed the exact files I intend to touch, and why (repo bug-fix rule #1)
   ☐ I have a branch off main to revert to
   ☐ No API/schema changes — this is a presentation-layer bug class

2. Icons & Colors:
   ☐ Using lucide-react (already a dependency — do NOT add feather-icons-react)
   ☐ Icon name resolved through the Feather → Lucide map above
   ☐ Color expressed as a Tailwind class or an existing token, not inline hex
   ☐ Light-tint background applied via class (bg-*-50 / bg-brand-cyan/15)
   ☐ Contrast ≥ 4.5:1 for any icon that carries meaning without a text label

3. Implementation Order:
   ☐ Prefer changing the shared component over changing N call sites
   ☐ Only touch call sites that bypass the shared component
   ☐ Check the .dark variant still reads correctly

4. Verification:
   ☐ cd apps/web && npx next typegen && npx tsc --noEmit --incremental false
   ☐ cd apps/web && npx eslint .   (errors only — ~186 warnings are pre-existing)
   ☐ Preview the affected route and confirm visually
   ☐ No new console errors

5. Documentation:
   ☐ List files modified + diff summary
   ☐ Call out any other feature that renders the same shared component
```

---

## Pre-implementation checklist

- [ ] Read `icon-color-system.md`
- [ ] Know which category you're fixing (Status, Navigation, Action, …)
- [ ] Resolve the Lucide icon name from the map above
- [ ] Decide the Tailwind class pair (icon color + tint background)
- [ ] Confirm the target component actually exists (`ls apps/web/components/shared`)
- [ ] Branch created

Do **not** run `npm ls feather-icons-react` — it is not and should not be a dependency.

---

## Color tokens

The palette in `icon-color-system.md` maps to Tailwind as follows. Prefer the
**token** column where one exists; it survives theme changes.

| Role | Hex | Tailwind text | Tailwind tint | Existing token |
|---|---|---|---|---|
| PRIMARY | `#2563eb` | `text-brand` | `bg-blue-50` | `--brand`, `--primary` |
| CYAN (info) | `#0e7490` | `text-cyan-700` | `bg-cyan-50` | `--brand-cyan` |
| SUCCESS | `#15803d` | `text-green-700` | `bg-green-50` | used in `StatusBadge` |
| WARNING | `#b45309` | `text-amber-700` | `bg-amber-50` | used in `StatusBadge` |
| DANGER | `#b91c1c` | `text-red-700` | `bg-red-50` | used in `StatusBadge` |
| NEUTRAL | `#434751` | `text-brand-muted` | `bg-[#e4e2e3]` | `--brand-muted` |
| PURPLE | `#7e22ce` | `text-purple-700` | `bg-purple-50` | — |
| ORANGE | `#c2410c` | `text-orange-700` | `bg-orange-50` | — |

**Why `-700`.** Measured, not estimated:

| on `-50` tint | `-500` | `-600` | `-700` |
|---|---|---|---|
| green | 2.31 ❌ | 3.15 ❌ | **4.79 ✅** |
| amber | 2.07 ❌ | 3.07 ❌ | **4.84 ✅** |
| red | 3.08 ❌ | 4.41 ❌ | **5.91 ✅** |
| orange | 2.45 ❌ | 3.35 ❌ | **4.88 ✅** |
| purple | 3.35 ❌ | 5.02 ✅ | **6.51 ✅** |

The old `icon-reference.md` published a contrast table claiming all `-500` pairs
passed at 5–7.8:1. Those figures are fabricated — the real values are above. Do not
reuse them.

Two further traps:

- **`--brand-cyan` (`#37bcf1`) fails on everything** — 2.18:1 on white. It is a
  decorative accent. For an icon that carries meaning use `text-cyan-700` (`#0e7490`).
- **`bg-brand/10` composites to ~`#e8effc`** → 4.48:1 with `text-brand`, marginally
  under. Use the solid `bg-blue-50` (4.75:1) for meaning-bearing pairs; `bg-brand/10`
  is fine behind an icon that also has a label.

`StatusBadge` currently uses `-600` on `-50`. That is tolerable for text-only badges
but not once an icon is added — bump those tones to `-700` in the same change.

---

## Per-category implementation notes

### BUG-AH-1: Status icons — **BLOCKED**

`PRESENT` / `LATE` / `ABSENT` / `ON_LEAVE` do not exist in the schema, the API, or
the web app. They are specified in `hr-attendance-schedule-improvements.md` as
future work. Ship that feature first, then this bug becomes real.

What *does* exist and is worth doing now: `StatusBadge` is text-only — no icon at
all. Adding an optional `icon?: LucideIcon` prop to it is the unblocking step, and
it serves BUG-AH-3 immediately.

**Files:** `apps/web/components/shared/StatusBadge.tsx`

---

### BUG-AH-2: Time & clock icons

| Concept | Lucide | Class pair |
|---|---|---|
| TIME_WORKED | `Clock` | `text-brand` / `bg-brand/10` |
| BREAK_TIME | `Coffee` | `text-orange-700` / `bg-orange-50` |
| OVERTIME | `AlertCircle` | `text-amber-700` / `bg-amber-50` |
| HOLIDAY | `Star` | `text-brand-cyan` / `bg-brand-cyan/15` |
| SHIFT | `BarChart3` | `text-green-700` / `bg-green-50` |

**Files:**
- `apps/web/components/shared/MetricCard.tsx` (pass `iconTone` at call sites)
- `apps/web/components/shared/StatCard.tsx` (needs an `iconTone` prop — currently hardcodes `text-brand`)
- `apps/web/features/time-tracking/components/*`
- `apps/web/features/timesheets/components/*`
- `apps/web/features/dashboard/components/*`

---

### BUG-AH-3: Approval / workflow icons

| State | Lucide | Class pair | Maps to `BadgeTone` |
|---|---|---|---|
| PENDING | `Clock` | `text-amber-700` / `bg-amber-50` | `warning` |
| APPROVED | `Check` | `text-green-700` / `bg-green-50` | `success` |
| REJECTED | `X` | `text-red-700` / `bg-red-50` | `danger` |
| SUBMITTED | `Send` | `text-brand` / `bg-brand-cyan/15` | `info` |
| REVISION_REQUESTED | `RefreshCw` | `text-amber-700` / `bg-amber-50` | `warning` |

These are the **real** `TimesheetStatus` / `LeaveRequestStatus` values, and
`timesheetStatusTone()` in `StatusBadge.tsx:15` already maps every one of them to a
tone. The fix is: add the icon to the tone, in one place.

**Files:**
- `apps/web/components/shared/StatusBadge.tsx` (primary — extend `TONES` with icons)
- `apps/web/features/timesheet-oversight/components/*`
- `apps/web/features/supervisor-leave/components/*`
- `apps/web/features/scrum-management/components/*`

---

### BUG-AH-4: Navigation icons

Sidebar icons are set in **two places** and both must change together:

1. `apps/api/src/modules/navigation/navigation.service.ts:25+` — the `icon:` string per menu item
2. `apps/web/features/app-shell/components/SidebarNavItem.tsx:34` — `ICON_MAP` resolves that string to a Lucide component

An icon string with no `ICON_MAP` entry renders **nothing** (`const Icon = ICON_MAP[item.icon]`) — there is no fallback. Adding a new icon name to the API without adding it to `ICON_MAP` silently blanks that nav item.

Real sections, with a proposed color per section:

| Section | Class | Rationale |
|---|---|---|
| WORKSPACE | `text-brand` | core work |
| MANAGEMENT | `text-amber-700` | team oversight / approvals |
| FINANCE_REPORTS | `text-brand-cyan` | analytics |
| FINANCE | `text-green-700` | money |
| SYSTEM | `text-purple-700` | admin |
| SUPPORT | `text-orange-700` | help / bugs / grievances |

Note the sidebar currently colors icons by **active state**, not by section. Coloring
by section changes the active/inactive affordance — check that active items are still
obviously active before committing.

**Files:**
- `apps/web/features/app-shell/components/SidebarNavItem.tsx`
- `apps/web/features/app-shell/components/SidebarNavSection.tsx`
- `apps/web/features/app-shell/components/AppSidebar.tsx`
- `apps/web/features/app-shell/components/AdminSidebar.tsx`
- `apps/api/src/modules/navigation/navigation.service.ts` (only if icon names change)

Finance runs a **separate shell with hardcoded nav** (see CLAUDE.md architecture
invariants) — check `apps/web/features/finance/` for a second nav to keep in sync.

---

### BUG-AH-5: Action icons

| Action | Lucide | Class |
|---|---|---|
| EDIT | `Pencil` | `text-brand` |
| DELETE | `Trash2` | `text-red-700` |
| VIEW | `Eye` | `text-brand-cyan` |
| DOWNLOAD | `Download` | `text-green-700` |
| UPLOAD | `Upload` | `text-brand` |
| ADD | `Plus` | `text-green-700` |
| SETTINGS | `SlidersHorizontal` | `text-purple-700` |
| CLOSE | `X` | `text-brand-muted` |

Action icons mostly sit inside `components/ui/button.tsx` variants — the button
variant should own the color, not the icon. Check whether the variant already
supplies it before adding a class to the icon.

**Files:**
- `apps/web/components/shared/DataTable.tsx`
- `apps/web/components/ui/button.tsx`
- `apps/web/components/shared/ConfirmationDialog.tsx`

---

### BUG-AH-6: Alert / severity icons

| Severity | Lucide | Class pair |
|---|---|---|
| ERROR | `AlertCircle` | `text-red-700` / `bg-red-50` |
| WARNING | `AlertTriangle` | `text-amber-700` / `bg-amber-50` |
| INFO | `Info` | `text-brand-cyan` / `bg-brand-cyan/15` |
| SUCCESS | `CheckCircle2` | `text-green-700` / `bg-green-50` |

`Toast.tsx` is the gap: its `ToastState.tone` is `"success" | "error" | "info"`, but
the render only branches on `isError` — **`info` renders identically to `success`,
green check and all.** That's a real bug, not just a color inconsistency. It also
has no `warning` tone. Fix the tone handling first, then the colors.

There is no `Alert.tsx` or `ValidationError.tsx`; inline validation is rendered
per-form. Grep for `text-red-` in `features/*/components` to find them.

**Files:**
- `apps/web/components/shared/Toast.tsx` (primary)
- `apps/web/components/shared/ErrorState.tsx`
- `apps/web/components/shared/EmptyState.tsx`

---

### BUG-AH-7: Leave & card icons

Only three leave types exist (`prisma/schema.prisma:117`):

| `LeaveType` | Lucide | Class pair |
|---|---|---|
| `ANNUAL` | `Umbrella` | `text-green-700` / `bg-green-50` |
| `SICK` | `Activity` | `text-red-700` / `bg-red-50` |
| `PERSONAL` | `User` | `text-purple-700` / `bg-purple-50` |

SIL / MATERNITY / PATERNITY / BEREAVEMENT would need a schema migration plus
Philippine statutory-leave logic. That is a **feature**, not an icon bug — do not
smuggle it in here.

Card/widget icons:

| Widget | Lucide | `iconTone` |
|---|---|---|
| Total Work Hours | `Clock` | `bg-brand/10 text-brand` |
| Break Hours | `Coffee` | `bg-orange-50 text-orange-700` |
| Days Logged | `CalendarDays` | `bg-green-50 text-green-700` |
| KPI Target | `Target` | `bg-purple-50 text-purple-700` |
| Pending Reviews | `Inbox` | `bg-amber-50 text-amber-700` |

**Files:**
- `apps/web/features/leave/components/*`
- `apps/web/features/supervisor-leave/components/*`
- `apps/web/components/shared/MetricCard.tsx` (call sites — prop already exists)
- `apps/web/components/shared/StatCard.tsx` (add `iconTone`)

---

## Finding instances

```bash
grep -rn "lucide-react" apps/web/features apps/web/components --include=*.tsx
```

```bash
grep -rn "text-\(red\|green\|amber\|blue\|cyan\|purple\|orange\|gray\)-[0-9]" apps/web/features --include=*.tsx
```

---

## Verification

`apps/web` has **no test suite**. Its gates are typecheck and lint, and they must be
run exactly as CI runs them (see CLAUDE.md → CI gate for why each flag matters):

```bash
cd apps/web && npx next typegen && npx tsc --noEmit --incremental false && npx eslint .
```

`--incremental false` is not optional — a bare `tsc --noEmit` can be served from a
stale `tsconfig.tsbuildinfo` and give a false all-clear. `next build` is **not** a
type gate (`ignoreBuildErrors: true`).

Backend Jest (`npm test` at the repo root) does not cover any of this. State that
explicitly in your summary rather than implying tests passed.

Visual check — start the dev server and inspect the affected route:

```bash
npm --prefix apps/web run dev
```

Then confirm at 375px / 768px / 1280px, and with the `.dark` class applied.

---

## Verification checklist

**Visual**
- [ ] Icon renders in the intended color
- [ ] Tint background is the light variant of that color
- [ ] Readable in dark mode (`.dark` variant)
- [ ] No layout shift vs. before

**Accessibility**
- [ ] ≥ 4.5:1 where the icon carries meaning alone
- [ ] A text label accompanies the icon (color is never the sole signal)
- [ ] `aria-hidden="true"` on decorative icons (matches existing convention)

**Code quality**
- [ ] No inline hex — Tailwind classes or `@theme` tokens only
- [ ] No new icon package added
- [ ] `tsc --noEmit --incremental false` clean
- [ ] `eslint .` reports no new **errors** (warnings are pre-existing; do not add `--max-warnings 0`)

**Consistency**
- [ ] Fix applied in the shared component, not duplicated across call sites
- [ ] Other features rendering that component spot-checked

---

## Rollback

```bash
git checkout main -- apps/web/components/shared apps/web/features
```

Nothing here touches dependencies or the database, so no reinstall or migration
rollback is needed.

---

## Common issues

**Icon renders nothing in the sidebar**
The icon string has no `ICON_MAP` entry in `SidebarNavItem.tsx:34`. There is no
fallback — add the mapping.

**Color class has no effect**
Lucide icons take `stroke="currentColor"`, so `text-*` works. If it doesn't, a
parent is setting an explicit `stroke`/`color`, or the class was purged — Tailwind v4
cannot see classes built by string concatenation. Write full class names.

**Dark mode looks wrong**
`-50` tint backgrounds are near-white and fail in dark mode. Pair them with a
`dark:` variant, or use an alpha tint (`bg-brand-cyan/15`) which adapts.

**Contrast failing**
The `-500`-on-`-100` pairs from the older doc do not pass. Use `-600` on `-50`.
Verify at https://webaim.org/resources/contrastchecker/.

---

## Summary

| Bug | Status | Real complexity |
|---|---|---|
| AH-1 Status | **Blocked** — statuses don't exist yet | n/a |
| AH-2 Time | Ready | Low — needs `StatCard.iconTone` |
| AH-3 Approval | Ready | Low — one file (`StatusBadge`) does most of it |
| AH-4 Navigation | Ready | **Medium** — API + web must stay in sync; touches active-state affordance |
| AH-5 Action | Ready | Low — mostly button variants |
| AH-6 Alert | Ready | Medium — `Toast` has a real tone bug to fix first |
| AH-7 Leave/Card | Ready (3 leave types, not 6) | Low |

Six of seven are actionable. Most of the value lands in four shared components —
`StatusBadge`, `Toast`, `MetricCard`, `StatCard` — plus the sidebar. That is days of
work, not the "2-3 weeks" the original estimate implied, because the original
assumed per-call-site find-and-replace across a directory structure that isn't there.
