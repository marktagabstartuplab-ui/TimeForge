# Agent instructions for TimeForge

This file is auto-loaded by OpenCode (and other AGENTS.md-aware tools) at the start of every session
in this repo. If you're a human, see `README.md` instead — this file is written for an AI agent.

## Before doing anything else

1. Read `README.md` in full — especially **"Project brief alignment"** (the current ✅/⚠️/❌ status of
   every module against the client's requirements) and **"Gotchas for future agents"**. That table is
   the source of truth for what's done vs. what's left. Do not re-audit the codebase from scratch.
2. If you need the original client requirements verbatim, they're summarized in the README; the full
   PDF is `Project Brief - TimeForge.pdf` (ask the user for its path if you need it directly).
3. If you're continuing prioritized gap-closing work, see `docs/ANTIGRAVITY-HANDOFF.md` — it has
   pre-written, chunked task prompts (Chunk 1–5) for each remaining gap in priority order. Despite the
   filename, those chunks are tool-agnostic and apply here too.
4. Don't start building until you've confirmed (to the user, briefly) what's already done and what
   you're about to work on — this repo has had many long sessions and it's easy to duplicate work
   that already exists.

## Stack

NestJS 10 (API, port 3000) · Next.js 16 App Router (web, port 3001) · Prisma/PostgreSQL (Supabase-hosted,
not Supabase Auth) · Redis + BullMQ (worker) · JWT auth · Tailwind · React Query.

## Working conventions (established — follow exactly)

- **Reuse, don't duplicate.** Check `apps/api/src/modules/*` and `apps/web/features/*` for an existing
  module/component before writing a new one.
- **Real data only.** No mock/placeholder values in anything reported as finished.
- **Audit + notify.** Every mutating action on payroll/HR/audit-sensitive data writes an `AuditLog`
  entry and, where relevant, a `Notification` — match the existing pattern (see `PayrollService`,
  `ScrumService`).
- **RBAC everywhere.** New endpoints need `@RequirePermissions`; check
  `packages/shared/src/permissions.ts` for existing permission constants before inventing new ones.
- **Multi-tenant.** Every Prisma query scoped by `tenantId` (+ `organizationId` where applicable).
- **Sidebar nav** is driven by `apps/api/src/modules/navigation/navigation.service.ts`'s `MENU_CATALOG`.
  Several items are deliberately role-scoped rather than permission-scoped (two roles can share a
  permission but need different nav behavior) — read the inline comments before adding/changing an item.
- **Currency is PHP (₱), never $.**
- **Verify live before reporting done.** Start the dev servers, log in as the relevant seeded role
  (see README for seeded accounts, password `ChangeMe123!`), click through the actual change.
- **Keep README.md in sync.** When you close a gap from the alignment table, update that table and the
  gap list in the same piece of work — it's the next session's starting point, don't let it go stale.

## Known traps (see README "Gotchas" for full detail — highlights below)

- `CacheService` (Redis) degrades gracefully with a 300ms timeout; if something hangs forever it's
  probably `REDIS_URL` connectivity, not the app.
- `apps/web/app/finance/**` is a **separate shell** (`FinanceAppShell`/`FinanceSidebar`, hardcoded nav) —
  it does not share the main `AppShell`/`AdminSidebar`.
- Base UI `Select` components must never render with an `undefined` value on first paint (causes a
  console error) — always fall back to `""`, sync async data via `useEffect`, not an inline derived value.
