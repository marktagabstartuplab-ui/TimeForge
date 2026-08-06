# TimeForge Icon Color System

**Design standard for consistent icon colors across the entire system.**

**Icon Library:** **`lucide-react`** (https://lucide.dev) — already a dependency (`^1.22.0`), used by 156 files in `apps/web`.

- Lucide is a fork of Feather; icon names below are given in Feather form for continuity, with the Lucide export in the adjacent column
- Consistent stroke-based design, `stroke="currentColor"` so Tailwind `text-*` classes work directly
- **Do not install `feather-icons-react`.** A second icon package is not warranted; every icon this system needs exists in Lucide

Reference this when implementing any icon colors to maintain visual hierarchy and user comprehension. For the file-by-file execution plan, see `icon-implementation-prompt.md`.

---

## Color Palette

Values are the Tailwind **`-700`** shades, measured against their `-50` tints.
Every pair below clears 4.5:1 — see [Contrast](#contrast-measured).

```
PRIMARY:        #2563eb (Blue)    — Actions, navigation, primary info   [--brand]
SUCCESS:        #15803d (Green)   — Present, approved, completed, active
WARNING:        #b45309 (Amber)   — Late, pending, caution, attention
DANGER:         #b91c1c (Red)     — Absent, denied, error, critical
GRAY:           #434751 (Gray)    — Neutral, disabled, secondary        [--brand-muted]
INFO:           #0e7490 (Cyan)    — Info, help, secondary actions
PURPLE:         #7e22ce (Purple)  — Custom, special, tags
ORANGE:         #c2410c (Orange)  — Break time, secondary warning
```

> ⚠️ **`--brand-cyan` (`#37bcf1`) is decorative only.** It measures **2.18:1 on
> white** and 1.95:1 on a cyan tint. It may be used for fills, accents and chart
> strokes, but never as the colour of an icon that carries meaning on its own. Use
> `#0e7490` (`text-cyan-700`) where the icon *is* the signal.

> **Two earlier drafts of this palette were wrong.** The first used `#0066CC` (not
> the brand colour) with `-500` shades; the second used `-600`. Both fail AA on
> light tints — `-600` green measures 3.15:1, amber 3.07:1, orange 3.35:1, red
> 4.41:1. Only `-700` and darker pass across the board.

---

## Icon Categories & Color Rules

### 1. Status Icons (User Presence / Time)

| Status | Color | Feather Icon | Locations |
|--------|-------|--------------|-----------|
| **PRESENT** | Green (#15803d) | `check-circle` | Attendance, Team Status, Dashboard |
| **LATE** | Amber (#b45309) | `alert-circle` | Attendance, Time Tracker, Reports |
| **ABSENT** | Red (#b91c1c) | `x-circle` | Attendance, Team Status |
| **ON_LEAVE** | Cyan (#0e7490) | `calendar` | Attendance, Dashboard, Schedule |
| **CLOCKED_IN** | Green (#15803d) | `play-circle` | Time Clock, Active Session |
| **CLOCKED_OUT** | Gray (#434751) | `stop-circle` | Time Clock, History |

> ⚠️ **Not yet implementable.** None of these status values exist in the schema, the
> API, or the web app — they are specified as future work in
> `hr-attendance-schedule-improvements.md`. This table is the standard to apply
> *when* attendance statuses land.

**Implementation:** Status badges in tables, attendance cards, employee profiles.
**Import:** `import { CheckCircle2, AlertCircle, XCircle, Calendar, PlayCircle, StopCircle } from 'lucide-react'`

---

### 2. Navigation Icons (Sidebar Sections)

Each sidebar section gets a distinct color for quick visual scanning.

These are the **actual** sections defined in `apps/api/src/modules/navigation/navigation.service.ts:12`.

| Section | Color | Purpose |
|---------|-------|---------|
| **WORKSPACE** | Blue (#2563eb) | Dashboard, Daily Scrum, Timesheets, My Schedule |
| **MANAGEMENT** | Amber (#b45309) | Team schedules, KPI, approvals, supervisor tools |
| **FINANCE_REPORTS** | Cyan (#0e7490) | Payroll, attendance & performance reports |
| **FINANCE** | Green (#15803d) | Finance shell — payroll processing, statutory reports |
| **SYSTEM** | Purple (#7e22ce) | Audit logs, security, AI settings, KPI management |
| **SUPPORT** | Orange (#c2410c) | Grievances, bug reports |

Per-item icons are **not** free-form: the API emits an icon *string*, and
`SidebarNavItem.tsx:34` resolves it through `ICON_MAP`. An unmapped string renders
nothing. Both files must change together.

**Implementation:** Sidebar icons + section dividers.
**Import:** `import { LayoutGrid, Timer, FileText, Users, BarChart3, SlidersHorizontal, Inbox } from 'lucide-react'`

---

### 3. Approval / Workflow Icons

| State | Color | Feather Icon | Meaning |
|-------|-------|--------------|---------|
| **PENDING** | Amber (#b45309) | `clock` | Awaiting review |
| **APPROVED** | Green (#15803d) | `check` | Accepted, confirmed |
| **REJECTED** | Red (#b91c1c) | `x` | Rejected, blocked |
| **SUBMITTED** | Blue (#2563eb) | `send` | Sent for review |
| **REVISION_REQUESTED** | Amber (#b45309) | `refresh-cw` | Needs changes |

These match the real `TimesheetStatus` and `LeaveRequestStatus` enums (the backend
value is `REJECTED`, not `DENIED`). `timesheetStatusTone()` in
`apps/web/components/shared/StatusBadge.tsx:15` already maps each to a `BadgeTone` —
attach the icon there rather than at call sites.

**Implementation:** Status badges, leave requests, timesheet submissions.
**Import:** `import { Clock, Check, X, Send, RefreshCw } from 'lucide-react'`

---

### 4. Action Icons (Buttons & Links)

| Action | Color | Feather Icon | Use Case |
|--------|-------|--------------|----------|
| **EDIT** | Blue (#2563eb) | `Pencil` | Modify existing |
| **DELETE** | Red (#b91c1c) | `Trash2` | Remove item |
| **VIEW** | Cyan (#0e7490) | `Eye` | Details/preview |
| **DOWNLOAD** | Green (#15803d) | `Download` | Export/save file |
| **UPLOAD** | Blue (#2563eb) | `Upload` | Add file |
| **ADD** | Green (#15803d) | `Plus` | Create new |
| **SETTINGS** | Purple (#7e22ce) | `SlidersHorizontal` | Configure |
| **CLOSE** | Gray (#434751) | `X` | Dismiss/cancel |

Lucide has no `Edit2` — use `Pencil` (or `SquarePen`). Where an action icon sits
inside a button, let the button variant own the colour.

**Implementation:** Table row actions, form buttons, card headers, modals.
**Import:** `import { Pencil, Trash2, Eye, Download, Upload, Plus, SlidersHorizontal, X } from 'lucide-react'`

---

### 5. Alert / Severity Icons

| Severity | Color | Feather Icon | Context |
|----------|-------|--------------|---------|
| **ERROR** | Red (#b91c1c) | `AlertCircle` | Critical issue |
| **WARNING** | Amber (#b45309) | `AlertTriangle` | Caution needed |
| **INFO** | Cyan (#0e7490) | `Info` | FYI, no action |
| **SUCCESS** | Green (#15803d) | `CheckCircle2` | Completed |

> `Toast.tsx` declares a `"info"` tone but only branches on `isError`, so **info
> currently renders as success** (green check). It has no `warning` tone at all.
> Fix the tone handling before the colours.

**Implementation:** Toasts, error/empty states, inline validation.
**Import:** `import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'`

---

### 6. Time & Clock Icons

| Concept | Color | Feather Icon | Locations |
|---------|-------|--------------|-----------|
| **TIME_WORKED** | Blue (#2563eb) | `Clock` | Summary cards, reports |
| **BREAK_TIME** | Orange (#c2410c) | `Coffee` | Summary cards, timesheets |
| **OVERTIME** | Amber (#b45309) | `AlertCircle` | Payroll, alerts |
| **HOLIDAY** | Cyan (#0e7490) | `Star` | Calendar, attendance |
| **SHIFT** | Green (#15803d) | `BarChart3` | Time tracking, schedule |

**Implementation:** Dashboard cards, timesheets, payroll reports, schedules.
**Import:** `import { Clock, Coffee, AlertCircle, Star, BarChart3 } from 'lucide-react'`

---

### 7. Leave & Attendance Icons

`LeaveType` (`prisma/schema.prisma:117`) has exactly three values:

| Type | Color | Lucide | Use |
|------|-------|--------|-----|
| **ANNUAL** | Green (#15803d) | `Umbrella` | Vacation / annual leave |
| **SICK** | Red (#b91c1c) | `Activity` | Medical absence |
| **PERSONAL** | Purple (#7e22ce) | `User` | Personal leave |

> SIL, MATERNITY, PATERNITY and BEREAVEMENT appeared in an earlier draft of this
> doc. They are **not** in the schema. Adding them requires a Prisma migration and
> Philippine statutory-leave accrual logic — that is a feature, not an icon change.

**Implementation:** Leave request modals, employee schedules, HR dashboards.
**Import:** `import { Umbrella, Activity, User } from 'lucide-react'`

---

### 8. Card / Widget Icons

`MetricCard` already takes an `iconTone` prop (`"bg-brand-cyan/15 text-brand"`) —
that is the seam. `StatCard` hardcodes `text-brand` and needs the same prop added.

| Widget | `iconTone` | Purpose |
|--------|-----------|---------|
| **Total Work Hours** | `bg-brand/10 text-brand` | Summary metric |
| **Break Hours** | `bg-orange-50 text-orange-700` | Summary metric |
| **Days Logged** | `bg-green-50 text-green-700` | Summary metric |
| **KPI Target** | `bg-purple-50 text-purple-700` | Goal tracking |
| **Pending Reviews** | `bg-amber-50 text-amber-700` | Awaiting action |
| **Completed Tasks** | `bg-green-50 text-green-700` | Progress |

**Implementation:** Dashboard cards, metric summaries, progress indicators.

---

## Implementation Checklist

When adding or updating icons, verify:

- [ ] Icon color matches the category above
- [ ] Background (if any) is the light tint of the icon color
- [ ] Contrast ratio is WCAG AA compliant (4.5:1)
- [ ] Icon is consistent across all similar uses
- [ ] Color is not the only indicator (use text labels too)
- [ ] Mobile display is readable
- [ ] Hover/active states are defined
- [ ] Disabled state uses Gray (#434751)

---

## Files That Need Consistency Updates

**High Priority (User-Facing):**
- Attendance status badges
- Time tracker summary cards
- Leave request workflow icons
- Approval status indicators
- Notification badge icons

**Medium Priority (Important but Less Frequent):**
- Navigation sidebar icons
- Action button icons
- Alert/warning icons
- Dashboard widget icons

**Low Priority (Background/Polish):**
- Form field icons
- Breadcrumb icons
- Loading spinners
- Empty state icons

---

## Lucide Setup

### Installation

Nothing to install. `lucide-react@^1.22.0` is already in `apps/web/package.json`.

```bash
cd apps/web && npm ls lucide-react
```

### Usage pattern

Colour comes from Tailwind classes, never inline hex. Inline `style` bypasses the
`@theme` tokens and the `.dark` variant, both of which this app uses.

```tsx
import { CheckCircle2, AlertCircle, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger";

const TONES: Record<Tone, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: "bg-green-50 text-green-700" },
  warning: { icon: AlertCircle,  className: "bg-amber-50 text-amber-700" },
  danger:  { icon: XCircle,      className: "bg-red-50 text-red-700" },
};

export function ToneBadge({ tone, label }: { tone: Tone; label: string }) {
  const { icon: Icon, className } = TONES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
```

Tailwind v4 cannot see class names built by concatenation — write them out in full.

### Sizing

The codebase sizes icons with classes, not the `size` prop. Match it:

```tsx
<Clock className="h-3.5 w-3.5" />  // inline with text
<Clock className="h-4 w-4" />      // default
<Clock className="h-5 w-5" />      // large
<Clock className="h-[26px] w-[26px]" />  // stat card
```

---

## Color Reference in Code

### Tailwind Classes

```
Blue:   text-brand        | bg-blue-50      4.75:1
Cyan:   text-cyan-700     | bg-cyan-50      5.15:1
Green:  text-green-700    | bg-green-50     4.79:1
Amber:  text-amber-700    | bg-amber-50     4.84:1
Red:    text-red-700      | bg-red-50       5.91:1
Gray:   text-brand-muted  | bg-[#e4e2e3]    7.21:1
Purple: text-purple-700   | bg-purple-50    6.51:1
Orange: text-orange-700   | bg-orange-50    4.88:1
```

Note `bg-blue-50` rather than `bg-brand/10` for the brand pair: a 10% alpha tint
composites to ~`#e8effc`, giving 4.48:1 — a hair under the bar. The solid `-50`
clears it.

### Contrast (measured)

Computed with the WCAG 2.x relative-luminance formula, not estimated:

| Pair | `-600` | `-700` | `-800` |
|---|---|---|---|
| green on green-50 | 3.15 ❌ | **4.79 ✅** | 6.81 ✅ |
| amber on amber-50 | 3.07 ❌ | **4.84 ✅** | 6.84 ✅ |
| red on red-50 | 4.41 ❌ | **5.91 ✅** | 7.60 ✅ |
| orange on orange-50 | 3.35 ❌ | **4.88 ✅** | 6.88 ✅ |
| purple on purple-50 | 5.02 ✅ | **6.51 ✅** | 8.13 ✅ |

Existing `StatusBadge` tones use `-600` on `-50` and therefore **do not meet AA for
the icon glyph**. They are acceptable today only because the badge always carries a
text label alongside. Adding icons to those badges is what makes the `-700` bump
necessary — do both in the same change.

Re-check any pair you invent:

```bash
node -e 'const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};const R=(a,b)=>{const x=L(a),y=L(b);return((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};console.log(R("#15803d","#f0fdf4"))'
```

### Existing theme tokens

Do not add `--icon-*` variables. `apps/web/app/globals.css` already defines the
brand palette under `@theme inline`, and Tailwind v4 exposes them as utilities:

```css
--brand:         #2563eb;   /* → text-brand,        bg-brand */
--brand-navy:    #002e3f;   /* → text-brand-navy */
--brand-ink:     #1b1b1c;   /* → text-brand-ink */
--brand-muted:   #434751;   /* → text-brand-muted */
--brand-cyan:    #37bcf1;   /* → text-brand-cyan */
--brand-surface: #f6f3f4;
```

A `.dark` variant is wired via `@custom-variant dark`. Solid `-50` tints read poorly
in dark mode — pair them with a `dark:` class, or use an alpha tint (`bg-brand-cyan/15`)
which adapts on its own.

---

## Examples

### Timesheet status badge

Extend the existing `TONES` map in `components/shared/StatusBadge.tsx` rather than
branching at call sites — `timesheetStatusTone()` already resolves every status.

```tsx
import { Clock, Check, X, Send, RefreshCw, type LucideIcon } from "lucide-react";

const TONE_ICONS: Record<BadgeTone, LucideIcon | null> = {
  neutral: null,
  info: Send,
  success: Check,
  warning: Clock,
  danger: X,
  brand: null,
};
```

Existing `TONES` classes stay as they are — they already use the passing `-600` pairs.

### Metric card icon

`iconTone` carries both the colour and its tint:

```tsx
<MetricCard icon={Coffee} iconTone="bg-orange-50 text-orange-700" label="Break Hours" value="1.5" />
```

### Navigation icon

Section colour is applied where the nav item renders, not passed as a hex:

```tsx
const SECTION_TONE: Record<string, string> = {
  WORKSPACE: "text-brand",
  MANAGEMENT: "text-amber-700",
  FINANCE_REPORTS: "text-brand-cyan",
  FINANCE: "text-green-700",
  SYSTEM: "text-purple-700",
  SUPPORT: "text-orange-700",
};
```

The icon component itself comes from `ICON_MAP[item.icon]` in `SidebarNavItem.tsx` —
an unmapped string renders nothing, so keep `ICON_MAP` in sync with
`navigation.service.ts`.

---

## Updating Existing Icons

To convert an existing icon to this system:

1. **Identify** the icon's category (Status, Navigation, Action, etc.)
2. **Map** to the appropriate color
3. **Update** both icon color and background
4. **Test** contrast and readability
5. **Verify** consistency across all similar uses

---

## Future Enhancements

- Dark mode color variants
- Animation states (hover, active, disabled)
- Icon library standardization
- Size guidelines (sm, md, lg)
- Accessibility testing framework
