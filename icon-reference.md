# TimeForge Icon Reference

**Quick lookup for icon names, colors, and sizes.**

Use this while coding. For the standard and its rationale see `icon-color-system.md`;
for the per-bug execution plan see `icon-implementation-prompt.md`.

> **Revised 2026-08-05.** The previous version of this file specified
> `feather-icons-react` (not installed), `#0066CC` as primary (not the brand colour),
> and a contrast table whose ratios were **fabricated** — it claimed 5–7.8:1 for pairs
> that actually measure 2.07–4.56:1. Six of its eight "AA compliant" pairs fail. If
> you have an older copy open, close it.

---

## Icon Library

**`lucide-react`** — https://lucide.dev — already installed at `^1.22.0`, used by
156 files in `apps/web`.

```bash
cd apps/web && npm ls lucide-react   # verify; do NOT install anything
```

Icons take `stroke="currentColor"`, so Tailwind `text-*` classes colour them
directly. Never use inline `style={{ color }}` — it bypasses the `@theme` tokens and
the `.dark` variant.

---

## Color Palette

Tailwind `-700` shades. These are the only values that clear 4.5:1 on their `-50`
tints — see [Contrast](#contrast-measured).

| Color | Hex | Tailwind | Tint | Usage |
|-------|-----|----------|------|-------|
| **Blue** | `#2563eb` | `text-brand` | `bg-blue-50` | Primary, actions, workspace |
| **Green** | `#15803d` | `text-green-700` | `bg-green-50` | Success, approved |
| **Amber** | `#b45309` | `text-amber-700` | `bg-amber-50` | Warning, pending, late |
| **Red** | `#b91c1c` | `text-red-700` | `bg-red-50` | Danger, error, rejected |
| **Gray** | `#434751` | `text-brand-muted` | `bg-[#e4e2e3]` | Neutral, disabled |
| **Cyan** | `#0e7490` | `text-cyan-700` | `bg-cyan-50` | Info, holiday |
| **Purple** | `#7e22ce` | `text-purple-700` | `bg-purple-50` | Admin, special |
| **Orange** | `#c2410c` | `text-orange-700` | `bg-orange-50` | Break time, support |

`#2563eb` is `--brand`; `#434751` is `--brand-muted`. Both are real tokens in
`apps/web/app/globals.css`.

> ⚠️ **`--brand-cyan` (`#37bcf1`) is decorative only** — 2.18:1 on white. Fine for
> fills, accents and chart strokes. Never the colour of an icon that carries meaning
> on its own; use `text-cyan-700` there.

---

## Status Icons — ⚠️ not yet implementable

`PRESENT` / `LATE` / `ABSENT` / `ON_LEAVE` do **not exist** in the schema, the API,
or the web app. They are future work per `hr-attendance-schedule-improvements.md`.
Table retained as the standard to apply once they land.

| Lucide | Class | Tint | Use |
|--------|-------|------|-----|
| `CheckCircle2` | `text-green-700` | `bg-green-50` | PRESENT |
| `AlertCircle` | `text-amber-700` | `bg-amber-50` | LATE |
| `XCircle` | `text-red-700` | `bg-red-50` | ABSENT |
| `Calendar` | `text-cyan-700` | `bg-cyan-50` | ON_LEAVE |
| `PlayCircle` | `text-green-700` | `bg-green-50` | CLOCKED_IN |
| `StopCircle` | `text-brand-muted` | `bg-[#e4e2e3]` | CLOCKED_OUT |

---

## Navigation Icons (Sidebar)

Real sections, per `apps/api/src/modules/navigation/navigation.service.ts:12`:

| Class | Section |
|-------|---------|
| `text-brand` | WORKSPACE |
| `text-amber-700` | MANAGEMENT |
| `text-cyan-700` | FINANCE_REPORTS |
| `text-green-700` | FINANCE |
| `text-purple-700` | SYSTEM |
| `text-orange-700` | SUPPORT |

Per-item icons are **not** free-form. The API emits an icon *string*; `ICON_MAP` in
`apps/web/features/app-shell/components/SidebarNavItem.tsx:34` resolves it to a
component. **An unmapped string renders nothing** — there is no fallback. Currently
mapped:

```
layout-grid · timer · file-text · users · building-2 · check-square · wallet
bar-chart-3 · scroll-text · calendar-days · calendar-clock · target
clipboard-check · sparkles · shield · shield-alert · shield-check · sliders
bug · clipboard-list
```

---

## Approval / Workflow Icons

Real `TimesheetStatus` / `LeaveRequestStatus` values (backend says `REJECTED`, not
`DENIED`):

| Lucide | Class | Tint | Status | `BadgeTone` |
|--------|-------|------|--------|-------------|
| `Clock` | `text-amber-700` | `bg-amber-50` | PENDING / UNDER_REVIEW | `warning` |
| `Check` | `text-green-700` | `bg-green-50` | APPROVED | `success` |
| `X` | `text-red-700` | `bg-red-50` | REJECTED | `danger` |
| `Send` | `text-brand` | `bg-blue-50` | SUBMITTED | `info` |
| `RefreshCw` | `text-amber-700` | `bg-amber-50` | REVISION_REQUESTED | `warning` |

`timesheetStatusTone()` in `components/shared/StatusBadge.tsx:15` already maps every
status to a tone. Attach icons there, not at call sites.

---

## Action Icons (Buttons)

| Lucide | Class | Action |
|--------|-------|--------|
| `Pencil` | `text-brand` | EDIT |
| `Trash2` | `text-red-700` | DELETE |
| `Eye` | `text-cyan-700` | VIEW |
| `Download` | `text-green-700` | DOWNLOAD |
| `Upload` | `text-brand` | UPLOAD |
| `Plus` | `text-green-700` | ADD |
| `SlidersHorizontal` | `text-purple-700` | SETTINGS |
| `X` | `text-brand-muted` | CLOSE |

Lucide has no `Edit2` — use `Pencil` (or `SquarePen`). Inside a button, let the
button variant own the colour.

---

## Alert / Severity Icons

| Lucide | Class | Tint | Severity |
|--------|-------|------|----------|
| `AlertCircle` | `text-red-700` | `bg-red-50` | ERROR |
| `AlertTriangle` | `text-amber-700` | `bg-amber-50` | WARNING |
| `Info` | `text-cyan-700` | `bg-cyan-50` | INFO |
| `CheckCircle2` | `text-green-700` | `bg-green-50` | SUCCESS |

> `Toast.tsx` declares tone `"info"` but only branches on `isError` — **info renders
> as success**, green check included. No `warning` tone exists. Fix the tone
> handling before touching colours.

---

## Time & Clock Icons

| Lucide | Class | Tint | Concept |
|--------|-------|------|---------|
| `Clock` | `text-brand` | `bg-blue-50` | TIME_WORKED |
| `Coffee` | `text-orange-700` | `bg-orange-50` | BREAK_TIME |
| `AlertCircle` | `text-amber-700` | `bg-amber-50` | OVERTIME |
| `Star` | `text-cyan-700` | `bg-cyan-50` | HOLIDAY |
| `BarChart3` | `text-green-700` | `bg-green-50` | SHIFT |

---

## Leave & Card Icons

`LeaveType` (`prisma/schema.prisma:117`) has **three** values, not six:

| Lucide | Class | Tint | Type |
|--------|-------|------|------|
| `Umbrella` | `text-green-700` | `bg-green-50` | ANNUAL |
| `Activity` | `text-red-700` | `bg-red-50` | SICK |
| `User` | `text-purple-700` | `bg-purple-50` | PERSONAL |

SIL / MATERNITY / PATERNITY / BEREAVEMENT are not in the schema. Adding them needs a
Prisma migration plus statutory-leave accrual logic — a feature, not an icon change.

Card widgets — pass as `iconTone` (prop already exists on `MetricCard`):

| Lucide | `iconTone` | Widget |
|--------|-----------|--------|
| `Clock` | `bg-blue-50 text-brand` | Total Work Hours |
| `Coffee` | `bg-orange-50 text-orange-700` | Break Hours |
| `CalendarDays` | `bg-green-50 text-green-700` | Days Logged |
| `Target` | `bg-purple-50 text-purple-700` | KPI Target |
| `Inbox` | `bg-amber-50 text-amber-700` | Pending Reviews |

`StatCard` hardcodes `text-brand` and has no `iconTone` — adding one is part of the
card-icon work.

---

## Icon Sizes

This codebase sizes with classes, not the `size` prop. Match it.

| Class | Use |
|-------|-----|
| `h-3.5 w-3.5` | Inline with text, badges |
| `h-4 w-4` | Default |
| `h-5 w-5` | Buttons, card headers |
| `h-[26px] w-[26px]` | Stat cards |

---

## Contrast (measured)

Computed with the WCAG 2.x relative-luminance formula against each colour's `-50`
tint. **Bold = the shade to use.**

| Family | `-500` | `-600` | `-700` | `-800` |
|--------|--------|--------|--------|--------|
| green | 2.31 ❌ | 3.15 ❌ | **4.79 ✅** | 6.81 ✅ |
| amber | 2.07 ❌ | 3.07 ❌ | **4.84 ✅** | 6.84 ✅ |
| red | 3.08 ❌ | 4.41 ❌ | **5.91 ✅** | 7.60 ✅ |
| orange | 2.45 ❌ | 3.35 ❌ | **4.88 ✅** | 6.88 ✅ |
| purple | 3.35 ❌ | 5.02 ✅ | **6.51 ✅** | 8.13 ✅ |

Other measured pairs:

| Pair | Ratio | |
|---|---|---|
| `#2563eb` on `bg-blue-50` (`#eff6ff`) | 4.75 | ✅ |
| `#2563eb` on `bg-brand/10` (≈`#e8effc`) | 4.48 | ❌ marginal |
| `#0e7490` on `bg-cyan-50` (`#ecfeff`) | 5.15 | ✅ |
| `#434751` on `#e4e2e3` | 7.21 | ✅ |
| `#37bcf1` on white | 2.18 | ❌ decorative only |

Verify any new pair yourself rather than trusting a table:

```bash
node -e 'const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};const R=(a,b)=>{const x=L(a),y=L(b);return((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};console.log(R("#15803d","#f0fdf4"))'
```

---

## Code Examples

### Tone map (the pattern to copy)

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

Full class names only — Tailwind v4 cannot see classes built by concatenation, so
`` `text-${color}-700` `` silently produces no style.

### Metric card

```tsx
<MetricCard icon={Coffee} iconTone="bg-orange-50 text-orange-700" label="Break Hours" value="1.5" />
```

### Action button

```tsx
<Button variant="ghost" size="icon" aria-label="Edit entry">
  <Pencil className="h-4 w-4" />
</Button>
```

Let the button variant carry the colour where one applies.

---

## Icon Checklist

- [ ] Icon exists in `lucide-react` (check https://lucide.dev — names differ from Feather)
- [ ] Colour is a Tailwind class or `@theme` token, never inline hex
- [ ] Tint is the `-50` of the same family
- [ ] Shade is `-700` (or `-800`) where the icon carries meaning
- [ ] Class names written out in full, not concatenated
- [ ] Size uses `h-* w-*`, matching neighbours
- [ ] `aria-hidden="true"` if decorative; `aria-label` on the control if not
- [ ] A text label accompanies it — colour is never the sole signal
- [ ] Readable with `.dark` applied
- [ ] `npx tsc --noEmit --incremental false` and `npx eslint .` clean in `apps/web`

---

## Notes

- Do **not** install `feather-icons-react`. `lucide-react` is the library.
- `apps/web` has no test runner — typecheck and lint are the only automated gates.
- Solid `-50` tints wash out in dark mode; pair with a `dark:` variant or use an
  alpha tint, which adapts.
- Feature code lives in `apps/web/features/<feature>/components/`, shared components
  in `apps/web/components/{shared,ui}/`. There is no `apps/web/app/<module>/` or
  `modules/` directory.
