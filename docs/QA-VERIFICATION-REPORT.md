# Manual QA & End-to-End Verification Report

**Date:** 2026-07-10
**Method:** Live application run (API on :3000, web on :3001, worker started) in the browser-preview environment, plus direct API smoke tests. Builds on, and does not repeat, the findings already verified and documented in `docs/PRODUCTION-READINESS-TRACKER.md` and `docs/RELEASE-VERIFICATION-REPORT.md`.

---

## Environment status

| Service | Status | Evidence |
|---|---|---|
| API (NestJS) | ✅ Running | Boots cleanly; `"Nest application successfully started"` in logs |
| Web (Next.js/Turbopack) | ✅ Running | Clean boot, no warnings, ~1.7s ready |
| Worker (BullMQ consumers) | ⚠️ Running but non-functional | Process starts but every queue connection throws `ECONNREFUSED 127.0.0.1:6379` continuously |
| Redis | ❌ Unavailable | `ioredis` cannot connect (`ECONNREFUSED ::1:6379` / `127.0.0.1:6379`). Root cause: local Docker engine is unresponsive (`docker ps` hangs indefinitely) — a pre-existing, previously documented environment issue (`docs/DOCKER-REDIS-BLOCKER.md`), not a new regression |
| Postgres (Supabase-hosted) | ✅ Reachable | Dashboard/auth/CRUD endpoints returned real data with correct latency figures |
| Supabase Storage / SMTP / OpenAI credentials | ⚠️ Configured, not exercised | All present in `.env`; upload/email/AI-job flows depend on Redis/BullMQ (worker) which is down this session, so end-to-end delivery could not be observed |

**Everything that depends on Redis/BullMQ (background jobs, AI report generation, async exports, some notification delivery) is marked Not Verified below, not Passed** — the API itself stays healthy and enqueues correctly (confirmed via direct request), but job execution cannot be observed without a working Redis connection.

---

## Workflows tested

| Workflow | Result | Notes |
|---|---|---|
| Web app boot (login page render, static assets, no console errors) | ✅ Passed | Verified via screenshot + DOM inspection after an initial accessibility-snapshot false alarm (stale snapshot, not a real hang — confirmed via `outerHTML` inspection and a subsequent screenshot showing the fully rendered Sign In form) |
| Login (ADMIN, `admin@demo.test`) | ✅ Passed | `POST /api/v1/auth/login` → 200, redirected to `/dashboard`, session established |
| Dashboard load (ADMIN) | ✅ Passed | Real data rendered: System Health "Up 5m", API latency 1627ms, DB latency 295ms, Active Sessions — all backed by live `GET /dashboard/*` calls, all 200 |
| Post-login parallel data fetch (navigation sidebar, current work session, `/users/me`, unread notification count, dashboard activity/charts/recent/overview) | ✅ Passed | All 8 requests observed in network log, all 200, no failed requests, no console errors |
| RBAC route-guarding — ADMIN accessing SUPERVISOR-only routes (`/supervisor/leave`, `/supervisor/ai-insights`) | ✅ Passed | Both returned 404 client-side — expected role-scoped route-guard behavior, not a bug |
| Auth, registration, password reset, email verification, RBAC positive/negative cases, tenant isolation, ~16 core module smoke tests (organization, employee mgmt, attendance, time tracking, timesheets, payroll, finance, reports, dashboards, team schedules, performance) | ✅ Already verified live in the prior verification pass this session continues from — see `docs/RELEASE-VERIFICATION-REPORT.md` §1. Not re-run here to avoid duplicating already-confirmed results. |
| Leave Management (all roles) | ❌ Failed | Already root-caused and documented as Critical in `docs/PRODUCTION-READINESS-TRACKER.md` — 403 for ADMIN/SUPERVISOR/EMPLOYEE due to stale `RolePermission` seed data. Not re-tested via UI this pass (would require a SUPERVISOR/HR login not yet exercised in this session) but the underlying API-level finding stands and is unrelated to Redis. |

---

## Workflows Not Verified (and why)

| Workflow | Why not verified |
|---|---|
| AI Insights / AI Reports / AI Recommendations / AI Forecasts / AI Alerts (job completion, retrieval, no duplicate/infinite polling) | Requires the worker to actually process `ai` queue jobs; Redis is unreachable this session, so no job execution could be observed. The API's enqueue step and graceful degradation (no 500s) were confirmed in the prior session — see `docs/RELEASE-VERIFICATION-REPORT.md`. |
| Exports (CSV/Excel/PDF via BullMQ) | Same Redis/worker dependency. Enqueue-and-degrade-gracefully behavior already confirmed; actual file generation/delivery not observable. |
| Notifications delivered via BullMQ/Realtime channel | Unread-count endpoint works (confirmed 200 above); actual async delivery pipeline depends on the same unavailable worker. |
| File uploads to Supabase Storage | Credentials present but no upload was exercised this pass; the `FileValidator`/`UploadService` code path was already statically reviewed (see tracker "Also flagged" section) but not run live in a browser this session. |
| Long-running session / access-token auto-refresh under real token expiry | Already verified and fixed in a prior session (`docs/TOKEN-REFRESH-FIX-REPORT.md`); not re-triggered this pass since it requires waiting out a real token TTL. |
| Responsive/mobile layouts | Not exercised this pass — no `preview_resize` pass was run. |
| Full role-by-role UI walkthrough for HR/Finance/Supervisor/Employee | Only ADMIN was logged into the browser this session; the other four roles' UI behavior was verified via direct API calls in the prior session, not via browser UI in this one. |

---

## Bugs found (new, this session)

None. The only anomaly encountered — an accessibility-snapshot tool reporting "Loading..." indefinitely on `/login` — was investigated and confirmed to be a **stale snapshot artifact of the testing tool itself**, not an application defect: `document.documentElement.outerHTML` showed the full rendered login form (101KB of real DOM), and a screenshot confirmed the Sign In card rendered correctly with all fields. No corresponding console errors, failed network requests, or server-side errors were found. Not logged as a product bug.

## Console errors

None observed. `preview_console_logs` showed only informational React DevTools prompts and HMR/Fast Refresh status messages across the whole session.

## Network/API errors

None outside of the expected: `/supervisor/leave` and `/supervisor/ai-insights` returning 404 for the ADMIN role (correct RBAC behavior, not an error), and the already-documented Leave Management 403s (tracked separately as Critical finding #Leave, not re-triggered this pass).

---

## Suggested fixes

No new fixes required this session — see `docs/PRODUCTION-READINESS-TRACKER.md` for the standing action items (role-permission reconciliation, RLS `BYPASSRLS` cutover, attachments file-size limit, placeholder-JWT-secret validation).

---

## Remaining deployment / infrastructure tasks

1. Fix the local Docker engine (or use a remote/staging Redis) so BullMQ-dependent workflows (AI jobs, exports, async notifications) can be verified end-to-end. This has blocked live verification of these flows for two sessions in a row now — recommend prioritizing a stable Redis instance (managed Redis or a working Docker install) specifically for QA purposes, independent of the RolePermission fix.
2. Everything else already listed in `docs/RELEASE-VERIFICATION-REPORT.md` §4 remains open (role-permission reconciliation, RLS cutover, attachments file-size limit, placeholder-secret validation, security-focused pass, demo password rotation).

---

## Final production readiness assessment

**Unchanged from the prior assessment: not yet ready to ship.** This pass reconfirms the app boots cleanly, core auth/RBAC/dashboard flows work correctly against live data with no console or network errors, and adds no new findings. The two blockers remain:

1. **Critical (data):** Leave Management is dead for every role — needs the role-permission reconciliation already scoped in the tracker.
2. **Environment gap (this session and the last):** Redis is unreachable locally, so BullMQ-backed features (AI jobs, exports, async notifications) cannot be verified end-to-end outside of "enqueues and degrades gracefully." These are explicitly marked Not Verified above rather than assumed passing — a real staging environment with working Redis is needed to close this gap before sign-off.

Everything independently testable in this pass (auth, dashboard, RBAC route-guarding, network/console cleanliness) passed with no new defects.
