# TimeForge — Frontend Design System

> Single source of truth for typography, spacing, radius, and shared components across `apps/web`.
> No arbitrary Tailwind values (`text-[Npx]`, `p-[Npx]`, `rounded-[Npx]`) outside this scale.

## Fonts

- **DM Sans** (`--font-dm-sans`, exposed as `--font-heading`) — display/headings only.
- **Inter** (`--font-inter`, exposed as `--font-sans`) — everything else (nav, forms, tables, body copy, labels).

Both loaded via `next/font/google` in `apps/web/app/layout.tsx`.

## Typography scale

Utility classes defined in `apps/web/app/globals.css` (`@layer utilities`):

| Class | Font | Weight | Size / line-height | Use for |
|---|---|---|---|---|
| `.text-display-xl` | DM Sans | 700 | 36px / 40px | Session timer, dashboard numbers, payroll totals, KPI metrics |
| `.text-h2` | DM Sans | 700 | 24px / 32px | Page titles |
| `.text-h3` | DM Sans | 500 | 18px / 28px | Card/widget/section titles |
| `.text-h4` | Inter | 600 | 16px / 24px | Task/employee name, table/notification/modal titles |
| `.text-body-lg` | Inter | 400 | 16px / 24px | Forms, inputs, descriptions |
| `.text-body` | Inter | 400 | 14px / 20px | Metadata, dates, helper text, secondary text |
| `.text-label` | Inter | 700 | 12px / 16px, `0.05em` tracking, uppercase | ACTIVE SESSION, STATUS, KPI, badge internals |

## Spacing

8px system: only `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48` px. This is already Tailwind's default scale (`p-1`…`p-12`) — never use arbitrary `p-[Npx]`/`gap-[Npx]` values.

## Radius

- `--radius-card: 16px` → `rounded-card` — cards, panels, section containers.
- `--radius-modal: 12px` → `rounded-modal` — modals, toasts.
- Existing generic scale (`rounded-sm/md/lg/xl/2xl/3xl/4xl`, based on `--radius: 10px`) — inputs/buttons/small chips; `rounded-full` for pills/badges/avatars.

## Shared components (`apps/web/components/{ui,shared}`)

Always reuse; never fork a near-duplicate. Extend via props/variants instead.

| Component | File |
|---|---|
| `Button` (variants: `default`/primary, `outline`/secondary, `destructive`/danger, `success`, `ghost`, `link`) | `components/ui/button.tsx` |
| `StatusBadge` (tones: neutral, info, success, warning, danger, brand) | `components/shared/StatusBadge.tsx` |
| `SectionCard`, `MetricCard`, `StatCard` | `components/shared/*.tsx` |
| `ProgressBar`, `ProgressRing` | `components/shared/*.tsx` |
| `DataTable` | `components/shared/DataTable.tsx` |
| `Dialog` / `Sheet` (modal shell — header, close button, backdrop, animation) | `components/ui/dialog.tsx` |
| `Toast` | `components/shared/Toast.tsx` |
| `EmptyState`, `ErrorState` | `components/shared/*.tsx` |

Sidebar and header layout/spacing are fixed and out of scope for styling sweeps — don't modify them incidentally.

## Icons

`lucide-react` only. Inline icons default to `h-4 w-4`; icons inside buttons/badges scale with the component's size prop.
