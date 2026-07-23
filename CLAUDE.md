# HeroTime — Project Status Snapshot

Last updated: 2026-07-07

**All client feature gaps are closed. The project is production-deploy ready.**

---

## Quick orientation

```
timeforge/
├── apps/
│   ├── api/          # NestJS 10 (port 3000) — backend API
│   ├── worker/       # BullMQ consumers — AI, exports, notifications
│   └── web/          # Next.js 16 App Router (port 3001) — frontend
├── packages/shared/  # Permission catalog, enums, DTOs
├── prisma/           # Schema, 14 migrations, seed.ts
├── docs/             # Contracts, release checklist, design system
└── docker-compose.yml
```

---

## What's been completed

### All 5 feature gaps (from README priority list)

| Gap | What was built | Key files |
|-----|---------------|-----------|
| 1. Attachments | Real file upload (POST/DELETE `/time-entries/:id/attachments`) via `UploadService` | `apps/api/src/modules/time-tracking/`, `UploadService` |
| 2. AI config admin | Per-feature toggle screen at `/admin/ai-config`, runtime enforcement in `AiService.triggerJob()` | `AdminService.getAiConfig()`, `AiConfigContent.tsx`, `navigation.service.ts` (SYSTEM section) |
| 3. Task field | `TimeEntry.task` stored separately from description | `time-tracking.service.ts`, `WorkDetailsCard.tsx`, `CurrentSessionCard.tsx` |
| 4. Department on entries | Overridable `departmentId` FK per time entry, falls back to user's profile department | `TimeEntry` model, `organization.service.ts` aggregation |
| 5a. Recurring blockers | Rule-based flag (3+/5 last entries) + red badge in scrum UI | `scrum.service.ts:attachRecurringBlockerFlag()`, `TeamScrumSubmissionsContent.tsx` |
| 5b. KPI audit | Confirmed `KpiMetricType` (COUNT/HOURS/PERCENT/CURRENCY) covers all brief examples — no change | `packages/shared/` |

### Production hardening

| Area | Status | Details |
|------|--------|---------|
| Rate limiting | ✅ | `@nestjs/throttler` — 120 req / 60s global |
| Exception filter | ✅ | `AllExceptionsFilter` — structured `{ success, error, code }`, no stack leakage |
| RLS | ✅ | `scripts/apply-rls.js` — run `npm run db:rls` after deploy |
| Migrations | ✅ | 14 migrations; latest captures `attachments`/`task`/`department_id` |
| Tests | ✅ | `jest.config.ts` + 7 tests (admin config + AI feature-toggling) |

### Other fixes completed during gap work

- `Toast.tsx` — added missing `"info"` tone type
- `Me` interface — added `createdAt`, `supervisor`, `avatarUrl`
- `AttendanceReportsContent.tsx` — fixed Select `undefined` first-paint bug
- `MyProfileContent.tsx` — type cast for form state
- Sidebar nav — added AI Settings under SYSTEM section

---

## Architecture invariants (don't break these)

- **Tenant isolation**: JWT → AsyncLocalStorage → Prisma middleware → RLS (4 layers)
- **Idempotency**: `Idempotency-Key` header required on bulk/payroll/AI endpoints
- **Audit trail**: Every mutating action on payroll/HR/AI writes `AuditLog` + `Notification`
- **RBAC**: `@RequirePermissions` guard; sidebar is partly role-scoped, not purely permission-scoped
- **Currency**: PHP (₱) everywhere — never $
- **Finance shell**: Separate `FinanceAppShell` with hardcoded nav — doesn't share main `AppShell`

---

## Supabase integration

Supabase is used as **managed PostgreSQL + object storage** only — NOT Supabase Auth (custom JWT/RBAC).

### Database (primary use)
- PostgreSQL hosted on Supabase (project `rfwqxeboudsjykhghbjk`)
- Pooled connection: `DATABASE_URL` via Supavisor (port 6543)
- Direct connection: `DIRECT_URL` for migrations/seeding/RLS (port 5432)
- Prisma ORM manages schema via migrations — no direct Supabase DB management

### Storage (provider-swappable)
- `apps/api/src/modules/storage/` — abstracted behind `StorageProvider` interface
- Provider selected by `STORAGE_DRIVER` env var: `local` (dev default) or `supabase`
- `SupabaseStorageProvider` (`apps/api/src/modules/storage/providers/supabase-storage.provider.ts:18`) uses `SUPABASE_SERVICE_ROLE_KEY` server-side only
- Bucket name: `timeforge` (`SUPABASE_STORAGE_BUCKET`)
- Logical folders: `avatars`, `scrum-attachments`, `reports`, `exports`, `documents`
- Used by: avatar uploads, time-entry attachments, scrum attachments, report/payroll/performance exports

### Edge functions
- One function deployed: `send-email` (`supabase/functions/send-email/index.ts`)
- Written in Deno, sends transactional emails via Nodemailer + Google SMTP
- Called from `MailerService` (`apps/api/src/infra/mailer.service.ts:34`) when `SUPABASE_SERVICE_ROLE_KEY` is set
- Falls back to direct SMTP or console mock if Supabase credentials absent

### Realtime
- `NotificationsRealtimeService` (`apps/api/src/modules/notifications/notifications-realtime.service.ts`) uses Supabase Realtime Broadcast for push notifications
- Per-user channels (`notifications:user:{userId}`) — client subscribes to own channel only
- Deliberately uses Broadcast (not Postgres Changes/RLS) because auth is custom JWT, not Supabase Auth

### CLI
- Project linked via `supabase link` — `.temp/linked-project.json` exists
- No `supabase/config.toml` committed — edge function deployment was manual or config not persisted
- To deploy edge function: `supabase functions deploy send-email --project-ref rfwqxeboudsjykhghbjk`

---

## Key file locations for future work

| Need | File |
|------|------|
| Auth principal type | `apps/api/src/common/decorators/index.ts:13` |
| Permission constants | `packages/shared/src/permissions.ts` |
| Sidebar nav catalog | `apps/api/src/modules/navigation/navigation.service.ts` |
| AI feature toggles | `apps/api/src/modules/ai/dto.ts` (feature list), `AdminService.getAiConfig()` (read), `AiService.checkFeatureEnabled()` (enforce) |
| Scrum recurring-blocker | `apps/api/src/modules/scrum/scrum.service.ts` (`attachRecurringBlockerFlag`) |
| Time entry service | `apps/api/src/modules/time-tracking/time-tracking.service.ts` |
| Prisma tenant middleware | `apps/api/src/common/prisma/prisma.service.ts` |
| Exception filter | `apps/api/src/common/filters/all-exceptions.filter.ts` |
| RLS script | `prisma/sql/rls.sql` |
| Organisation settings | `apps/api/src/modules/organization/organization.service.ts` |

---

## Remaining / future considerations (not blockers)

1. **Deliverables field** — the brief mentions a dedicated Deliverables field on time entries. Not implemented, was lowest priority.
2. **Open-ended KPI metric types** — `KpiMetricType` is a fixed 4-value enum. Brief may want free-text. Was confirmed as stretch goal.
3. **Test coverage** — 7 tests is a foundation. Full coverage of all modules would be ideal but wasn't scoped.
4. **CI/CD** — No GitHub Actions or similar pipeline configured. No lint/typecheck/test gate.
5. **OpenAI key** — Worker falls back to stub mode when `OPENAI_API_KEY` is absent. Not a bug, but production needs the real key.
6. **Seed data** — Demo accounts use `ChangeMe123!` — rotate before production.

---

## How to start

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # or: db push (dev only)
npm run db:seed
npm run start:api            # terminal 1
npm run start:worker         # terminal 2
npm --prefix apps/web run dev  # terminal 3
```

Login with `admin@demo.test` / `ChangeMe123!` → Swagger at `http://localhost:3000/api/docs`.
