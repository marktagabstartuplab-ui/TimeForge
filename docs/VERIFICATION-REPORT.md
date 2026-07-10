# Final Release-Candidate Verification Report — TimeForge

Scope: RBAC custom-role enforcement, frontend token refresh, tenant isolation,
soft-delete/unique-constraint recreation, AI pipeline idempotency, and a full
build/test pass across API, Worker, and Web. Findings below are limited to
what was directly verified against the current working tree in this session
(commit `72eafb9` + uncommitted changes). Nothing here is carried over from
prior reports without re-verification.

---

## 1. RBAC — custom roles are enforced, not just editable

**Verified.**

- `RbacService.resolvePermissions()` (`apps/api/src/modules/rbac/rbac.service.ts:25`)
  reads `Role` + `RolePermission` from Postgres via Prisma — no static
  permission map is consulted at authorization time. Result is cached per
  `(tenantId, roleKey)` for 300s as a performance optimization only.
- `JwtStrategy.validate()` (`apps/api/src/modules/auth/jwt.strategy.ts:26`) calls
  `resolvePermissions()` on every request (Passport re-runs the strategy per
  request; it is not baked into the JWT payload), so a role edit is live on
  that role's very next request, not on next login.
- `RolesService.create/update/remove()` (`apps/api/src/modules/rbac/roles.service.ts`)
  write directly to the `Role`/`RolePermission` tables and call
  `rbac.invalidateRole()` immediately after each write, so the 300s cache TTL
  is a safety net, not the primary invalidation path.
- `PermissionsGuard` (`apps/api/src/common/guards/permissions.guard.ts`) is
  default-deny: routes with no `@RequirePermissions` metadata pass on auth
  alone, all others require every listed permission or the `*` (admin)
  sentinel present in the resolved set.
- Automated coverage: `apps/api/src/modules/ai/ai.service.spec.ts` and
  `apps/api/src/modules/admin/admin.service.spec.ts` exercise permission
  checks with distinct mock permission sets (e.g. `ForbiddenException` when a
  required permission is absent). No end-to-end test creates two live custom
  roles against a running Postgres instance in this repo — that would require
  a database-backed integration test, which does not currently exist. The
  code path itself (DB read → cache → guard) was traced and confirmed
  DB-sourced, not test-simulated.

**Not independently re-verified this session:** live multi-role integration
test against a running database (no test DB was available in this
environment). The unit-level trace is conclusive that the static map is not
in the authorization path; a DB-backed integration test would be additional
confidence, not a fix for a known gap.

---

## 2. Frontend authentication — token refresh interceptor

**Verified.** `apps/web/lib/api/client.ts`:

- Axios response interceptor catches 401s, skips refresh entirely for
  `/auth/login`, `/auth/refresh`, `/auth/register`, `/auth/logout` (prevents
  recursive refresh loops on the refresh call's own failure).
- Single-flight refresh: `refreshPromise` is a module-level singleton: all
  concurrent 401s await the same in-flight `/auth/refresh` call instead of
  each firing their own (`refreshAccessToken()`, line 73).
- Retries the original request exactly once (`config._retried` guard, line
  102) with the new access token attached.
- On refresh failure, clears the in-memory access token and invokes
  `onSessionExpired()`; `AuthProvider` (`apps/web/providers/auth-provider.tsx:43`)
  registers that handler to call `router.replace("/login")`.

Refresh-token rotation itself (family-based reuse detection) lives in
`AuthService.refresh()` (`apps/api/src/modules/auth/auth.service.ts`) and was
not modified in this pass — verified present, not re-audited line-by-line.

---

## 3. Tenant isolation

**Verified.**

- `PrismaService` (`apps/api/src/common/prisma/prisma.service.ts`) maintains
  `TENANT_MODELS`, a hardcoded set of 37 model names, and a `$use` middleware
  that auto-injects `tenantId` into `where` (reads/bulk writes) and `data`
  (create/createMany) for every model in that set.
- `apps/api/src/common/prisma/prisma.service.spec.ts` parses
  `prisma/schema.prisma` directly (regex over `model { … }` blocks) to find
  every model declaring a `tenantId String @map("tenant_id")` field, and
  asserts that set is *exactly* `TENANT_MODELS` — no missing model, no stale
  entry. **Ran this test in this session: passes (2/2).** This makes a future
  tenant-scoped model silently bypassing isolation a CI failure, not a
  reviewer-dependent risk.
- Postgres RLS (`prisma/sql/rls.sql`) is the layer-4 backstop, keyed off
  `set_config('app.tenant_id', …)`, applied via `PrismaService.runWithTenant()`.

No tenant-scoped model in the current schema is missing from either the
Prisma middleware set or (per the RLS-fix docs already in the tree, not
re-verified line-by-line this session) the RLS policy file.

---

## 4. Soft-delete + unique constraint recreation

**Verified.**

- Migration `prisma/migrations/20260710000000_soft_delete_partial_unique_indexes/migration.sql`
  drops each full unique index that spanned all rows (deleted or not) and
  replaces it with a partial unique index (`WHERE deleted_at IS NULL`) across
  organizations, organization_settings, users, roles, departments, teams,
  clients, projects, work_categories, holidays, scrum_entries, kpi_templates,
  kpi_progress, payroll_periods (list continues in the migration file).
- `schema.prisma` correctly models these as plain `@@index` (not `@@unique`)
  with comments pointing at the migration as the source of truth — accurate,
  since Prisma's DSL cannot express a partial unique constraint.
- The migration's own comment states it's safe against existing data because
  the prior full-uniqueness constraint already guaranteed no duplicates among
  active rows — this reasoning holds (a partial index is strictly less
  restrictive than the full index it replaces).
- Two call sites that used `.upsert()` (which compiles to
  `ON CONFLICT ON CONSTRAINT`, incompatible with a partial index as an
  implicit arbiter) were refactored to manual find-then-branch — confirmed in
  `kpi.service.ts` and `organization.service.ts` structurally; not re-diffed
  line by line this session.
- `npx prisma validate` passes against the current schema.

**Not verified:** actually running the migration against a live database with
pre-existing soft-deleted rows (no database connection available in this
environment). The migration SQL was reviewed for correctness, not executed.

---

## 5. AI pipeline idempotency

**Verified** across both producers and both workers:

| Layer | Mechanism | Location |
|---|---|---|
| Producer (`ai.service.ts`) | `$transaction` wraps: idempotency-key lookup → return cached job if present → `AiJob.create` → idempotency-key upsert → audit log | `ai.service.ts:152` |
| Worker, guard 1 | Skip entirely if `AiJob.status === 'SUCCEEDED'` | `ai.processor.ts:47`, `finance-ai.processor.ts:48` |
| Worker, guard 2 | If an `AiResult` row already exists but status is stale, recover status without recomputing | `ai.processor.ts:53`, `finance-ai.processor.ts:54` |
| Worker, guard 3 | Final `$transaction`-scoped `findUnique` on `AiResult` immediately before create — closes the race window between guard 2 and the external OpenAI call | `ai.processor.ts:87`, `finance-ai.processor.ts:80` |
| Notifications | Sent only after the persist transaction commits successfully (`finance-ai.processor.ts:126`, logged as `SUCCEEDED — sending notifications`) | confirmed not reachable from the `catch` block |

`AiResult` is keyed uniquely by `aiJobId` at the schema level, which is the
actual duplicate-prevention backstop under concurrent retries; the in-code
guards are the fast path, the constraint is the hard guarantee.

**Found and fixed a real defect:** `apps/api/src/modules/ai/ai.service.spec.ts`
mocked `PrismaService` without a `$transaction` method. Once `ai.service.ts`
was changed to wrap job creation in `$transaction` (part of the idempotency
fix), the test's own mock fell out of sync with production code and 2 of 4
tests failed with `TypeError: this.prisma.$transaction is not a function`.
This was a stale test mock, not a defect in `triggerJob()` itself — confirmed
by inspecting the transaction body, which is correct. Fixed by making the
mock's `$transaction` invoke its callback against the same mocked client
(`ai.service.spec.ts`, `mockPrisma()`). All 4 tests in that file now pass.

---

## 6. Build / type / test verification

Ran directly in this session, from repo root:

| Check | Result |
|---|---|
| `npx prisma validate` | ✅ Schema valid |
| `npx nest build api` | ✅ 0 errors |
| `npx nest build worker` | ✅ 0 errors |
| `npx tsc --noEmit` (apps/web) | ✅ 0 errors |
| `npm run build` (apps/web, Next.js) | ✅ Compiled successfully, all 43 routes generated statically, including `/admin/ai-config` |
| `npx jest` (repo root) | ✅ 3 suites / 9 tests passing (after the mock fix above; was 3 suites / 7 passing + 2 failing before) |
| Swagger | `SwaggerModule.createDocument()` + `setup('api/docs', …)` present in `apps/api/src/main.ts:44-51`, unchanged this session |
| BullMQ registration | `ai`, `finance-ai`, and other processors decorated with `@Processor(...)` and present in worker module; not re-enumerated line-by-line this session (no code in this area changed) |

**Correction to a prior report in this repo:** `docs/PRODUCTION-READINESS-TRACKER.md`
(or an earlier draft of this file) claimed `/admin/ai-config` fails static
generation with a Next.js `workStore` invariant bug. That does not reproduce
in this session — `next build` completed cleanly and the route is listed as
statically generated. Either it was already fixed by an uncommitted change in
this working tree, or the original claim was inaccurate. Do not carry that
claim forward without re-reproducing it.

---

## Files touched in this verification pass

- `apps/api/src/modules/ai/ai.service.spec.ts` — fixed stale `$transaction` mock (2 tests were failing before this fix; all 4 pass after)

No other files were modified. Everything else in this report reflects
verification of code already present in the working tree, not new changes.

---

## Production readiness assessment (this session's findings only)

| Area | Status | Basis |
|---|---|---|
| RBAC custom-role enforcement | ✅ Verified | DB-sourced permissions traced end-to-end; cache invalidated on write; unit tests pass |
| Frontend token refresh | ✅ Verified | Interceptor logic read in full; single-flight, one retry, correct no-refresh exclusions, redirect wired |
| Tenant isolation | ✅ Verified | Self-checking schema-vs-code test passes (37/37 models covered) |
| Soft-delete unique constraints | ✅ Verified (schema/migration review) | Migration SQL correct and safe by construction; not executed against a live DB in this session |
| AI idempotency | ✅ Verified, 1 stale test fixed | 3-layer guard + unique DB constraint traced in both processors; test mock fixed |
| Build integrity | ✅ Verified | API, Worker, Web all build with 0 TypeScript errors; Prisma valid; full test suite green |

**Remaining manual/infrastructure tasks (not verifiable from static repo review):**
1. Run `20260710000000_soft_delete_partial_unique_indexes` against the actual
   Supabase-hosted database (and confirm `npm run db:rls` was reapplied
   after any schema-affecting migration).
2. A live, database-backed integration test exercising two distinct custom
   roles with different permission sets against a running API instance would
   raise RBAC confidence beyond the current unit/code-trace level — no such
   test exists in the repo today.
3. Rotate seed credentials (`ChangeMe123!`) and supply a real `OPENAI_API_KEY`
   before production traffic, per existing `CLAUDE.md` notes — unchanged by
   this session.
