# RLS Enablement Report — `permissions`, `user_roles`, `role_permissions`, `_prisma_migrations`

## Architecture Context

TimeForge uses a **backend-only access pattern**:
- **NestJS API** connects via Prisma using a **superuser** `DATABASE_URL` (`postgres.rfwqxeb…`), which **bypasses RLS entirely** (PostgreSQL superusers always bypass row-level security regardless of `FORCE ROW LEVEL SECURITY`).
- **Supabase** is used only as a database host — no Supabase Auth or PostgREST is used by the frontend.
- **RLS is defense-in-depth**: the `timeforge_app` role (created by `rls.sql`) exists for future restricted-access scenarios but is **not currently used** by the runtime connection.
- **`app.tenant_id`** is never set during normal request processing (`runWithTenant` exists but has zero callers); all tenant scoping is done at the application layer via Prisma middleware.

Because the runtime database user bypasses RLS, enabling RLS on these tables **cannot break backend functionality**. Policies serve only to block Supabase anon/authenticated PostgREST access (should it ever be exposed) and to provide a correct configuration for the `timeforge_app` role.

## Changes Made

**File modified:** `prisma/sql/rls.sql`

### Section 4 — RBAC catalog tables

```sql
-- Enables RLS on permissions, user_roles, role_permissions
-- Creates the "backend_service_role" policy allowing timeforge_app full access
-- Supabase anon/authenticated roles have no matching policy → denied
```

| Table | RLS Enabled | Policy Name | Policy Definition |
|-------|-------------|-------------|-------------------|
| `permissions` | ✅ `ENABLE ROW LEVEL SECURITY` | `backend_service_role` | `FOR ALL TO timeforge_app USING (true) WITH CHECK (true)` |
| `user_roles` | ✅ `ENABLE ROW LEVEL SECURITY` | `backend_service_role` | `FOR ALL TO timeforge_app USING (true) WITH CHECK (true)` |
| `role_permissions` | ✅ `ENABLE ROW LEVEL SECURITY` | `backend_service_role` | `FOR ALL TO timeforge_app USING (true) WITH CHECK (true)` |

### Section 5 — Prisma internal table

| Table | RLS Enabled | Policy | Behavior |
|-------|-------------|--------|----------|
| `_prisma_migrations` | ✅ `ENABLE ROW LEVEL SECURITY` | None (default-deny) | All non-superuser queries return zero rows |

### No `FORCE ROW LEVEL SECURITY`

These tables do **not** use `FORCE RLS`. The existing tenant-scoped tables use `FORCE RLS` because they rely on the `app.tenant_id` GUC pattern. For tables without `tenant_id`, `FORCE RLS` provides no benefit and would complicate any future direct-table-owner operations.

## Files Modified

| File | Change |
|------|--------|
| `prisma/sql/rls.sql` | Added sections 4 and 5 — RLS enablement + policies for 4 tables |

**No TypeScript, Prisma schema, or migration files were modified.**

## Compatibility Verification

| Concern | Result | Explanation |
|---------|--------|-------------|
| Backend authentication (login) | ✅ No impact | `AuthService.login()` reads `UserRole` through Prisma relations — superuser bypasses RLS |
| RBAC permission resolution | ✅ No impact | `RbacService.resolvePermissions()` reads `RolePermission`/`Permission` through Prisma — superuser bypasses RLS |
| Prisma migrations | ✅ No impact | Prisma CLI connects as superuser via `DIRECT_URL` — bypasses RLS |
| Prisma `prisma generate` | ✅ Passes | No schema changes, client unchanged |
| API + Worker build | ✅ 0 errors | `nest build api && nest build worker` |
| Prisma validate | ✅ Valid | `prisma validate` passes |
| Custom role CRUD | ✅ No impact | `RolesService` writes to `RolePermission` via Prisma — superuser bypasses RLS |
| Supabase PostgREST access | ✅ Blocked | `anon`/`authenticated` roles have no policy on any of the 4 tables — default-deny |
| Frontend direct DB access | ✅ Blocked | Frontend never connects to Supabase directly (NestJS API only) |

## Security Improvement

Before: Four tables had `RLS disabled` — any database user with table-level `GRANT` could read/write them.
After: All four tables have `RLS enabled`. The `permissions`, `user_roles`, and `role_permissions` tables are accessible only by:
- PostgreSQL superusers (bypass RLS) — used by Prisma runtime + CLI
- The `timeforge_app` role — created for restricted application access

The `_prisma_migrations` table is accessible only by PostgreSQL superusers — all other roles get zero rows.

## Deployment

Run `npm run db:rls` after the next migration deploy to apply the updated RLS policies. The script is idempotent and safe to re-run.
