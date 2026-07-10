# RBAC Fix Report — Custom Role Authorization

**Date:** 2026-07-10
**Scope:** Finding C1 from the Principal Engineer Release Review (Critical) — "Custom RBAC roles have zero effect on authorization."
**Status:** ✅ Fixed and verified live.

---

## 1. Problem

The application had a fully-built, database-backed custom role editor (`RolesService` — create/update/delete roles, assign permission sets, permission matrix UI) writing to the `Role` and `RolePermission` tables.

But actual authorization never read those tables. `RbacService.resolvePermissions()` resolved every user's effective permissions from a hardcoded static map (`ROLE_PERMISSIONS` in `packages/shared/src/permissions.ts`) instead. Editing a role's permissions through the admin UI silently did nothing — the change was persisted to the database but had zero effect on what that role could actually do.

## 2. Root Cause

Two independent, disconnected systems:

- **Write path** (`roles.service.ts`): DB-backed, fully functional, audit-logged.
- **Read path** (`rbac.service.ts` → `jwt.strategy.ts`): static in-memory map, never touched the database.

`JwtStrategy.validate()` called the static resolver on every authenticated request, so no amount of editing roles via the API could ever change a user's actual access.

## 3. Fix

| File | Change |
|---|---|
| `apps/api/src/modules/rbac/rbac.service.ts` | Rewritten: `resolvePermissions(tenantId, roleKeys)` is now async and queries `Role` → `RolePermission` → `Permission` directly, explicitly filtered by `tenantId` in the query itself (not the request-context middleware, since this runs *before* that context exists during JWT validation). Results cached per `(tenantId, roleKey)` via the existing Redis `CacheService` (5 min TTL, safety net only). If a role's resolved permissions cover the entire permission catalog, the result collapses to the `'*'` sentinel — this preserves all ~30 existing `permissions.includes('*')` checks scattered across the codebase without touching any of them. |
| `apps/api/src/modules/rbac/roles.service.ts` | `create`/`update`/`remove` now call `rbac.invalidateRole()` after every DB write, so a role edit takes effect on the *next request*, not after the cache TTL expires. |
| `apps/api/src/modules/auth/jwt.strategy.ts` | Awaits the now-async `resolvePermissions`, passes `tenantId` from the JWT payload. |
| `apps/api/src/modules/navigation/navigation.service.ts` + `navigation.module.ts` | Removed a redundant second `resolvePermissions` call (dead-weight duplication — `AuthPrincipal.permissions` is already resolved once by the guard; the sidebar service was needlessly re-resolving it). Dropped the now-unused `RbacModule` import. |

**Not touched:** `ROLE_PERMISSIONS` (the static map) still exists and is still used — by `prisma/seed.ts`, as the default/bootstrap data written into `Role`/`RolePermission` when a tenant is first provisioned. That's a legitimate, different purpose (seed data, not runtime resolution) and was left alone.

## 4. Live Verification

Not just typechecked — exercised against the running API and a real login session:

1. Logged in as `employee@demo.test`, confirmed baseline `200 OK` on `GET /kpi/templates` (gated by `kpi_template:read`).
2. As `admin@demo.test`, `PATCH`'d the EMPLOYEE role to remove `kpi_template:read`.
3. Re-hit `GET /kpi/templates` using the **same, already-issued** employee access token — no re-login, no restart. Result: `403 Forbidden`, immediately.
4. Restored the permission via another `PATCH`. Same token, same endpoint → `200 OK` again, immediately.
5. Confirmed `ADMIN`, `HR`, `FINANCE`, `SUPERVISOR` all still authenticate and resolve permissions correctly (no regression on system roles).
6. Created a brand-new custom role (`RBAC Test Role`) via the API, verified it worked end-to-end, then deleted it and confirmed cleanup.
7. `npx tsc --noEmit` clean across `api`, `web`, and `worker` — zero TypeScript errors.

## 5. Result

Editing a custom role's permissions now takes effect immediately, on the very next request, with no code change, redeploy, or re-login required — exactly the guarantee the custom-role editor UI was always supposed to provide.
