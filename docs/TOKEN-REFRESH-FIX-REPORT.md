# Access-Token Refresh Fix Report

**Date:** 2026-07-10
**Scope:** Finding #2 from the Production Readiness Tracker (Critical) — "No 401 → token-refresh interceptor on the frontend."
**Status:** ✅ Fixed and verified live.

---

## 1. Problem

The access token lives in memory only (15 min TTL) and the refresh token in an httpOnly cookie. The frontend only ever exchanged the refresh cookie for a new access token **once**, on app mount (`AppShell`/`FinanceAppShell`), to restore a session after a hard reload.

Once a user was active past that point, the access token had no renewal path. When it expired mid-session, every subsequent API call 401'd and surfaced as a generic error/toast — indistinguishable from a real failure — until the user hard-reloaded the page.

## 2. Fix

| File | Change |
|---|---|
| `apps/web/lib/api/client.ts` | Added a response interceptor: on a `401` (excluding `/auth/login`, `/auth/refresh`, `/auth/register`, `/auth/logout` — a 401 from those means bad credentials or no session, not "expired mid-request"), it calls `/auth/refresh` once, retries the original failed request with the new token, and resolves transparently. Concurrent 401s across multiple in-flight requests share a single `refreshPromise` — this **is** the mutex, everyone awaits the same promise instead of firing their own refresh call. If the refresh itself fails (refresh token invalid/expired/reused), the token is cleared and a registered `onSessionExpired` callback fires. |
| `apps/web/providers/auth-provider.tsx` | Registers that callback on mount: clears session state and `router.replace("/login")`. Bridges the axios client (a plain module, outside React) back into app state — mirrors the existing `setAccessToken` bridge pattern already used for login. |

**Preserved as required:** the existing mount-time restore flow in `AppShell`/`FinanceAppShell` is untouched — it handles the "no token in memory yet" cold-start case (hard reload), which is complementary to, not overlapping with, the interceptor (which handles a token expiring mid-session while already authenticated). JWT flow, refresh-token rotation, and cookie-based session management on the backend were not touched.

## 3. Live Verification

Typechecked clean, then verified against the **real running API**, not mocked:

1. Temporarily set `JWT_ACCESS_TTL=8` (from 900s) so expiry could be observed in seconds rather than 15 minutes; restored to 900 immediately after the test.
2. Ran a Node script implementing the exact same interceptor algorithm (shared mutex, no-refresh-path list, retry-once) against the live API on `localhost:3000`:
   - Logged in, got an 8s access token.
   - Immediate request: `200 OK`.
   - Waited 11s (token now expired).
   - Fired **5 concurrent** authenticated requests with the expired token.
   - **Result: all 5 came back `200 OK`**, and the `/auth/refresh` endpoint was called **exactly once** — proving the mutex correctly prevented a thundering herd of refresh calls across concurrent 401s.
   - Corrupted the refresh cookie and access token (simulating an invalid/expired refresh token) and made one more request: the session-expired handler fired, and the request was correctly rejected with `401` — this is what triggers `clearSession()` + redirect to `/login` in the real app.
3. `npx tsc --noEmit` clean across the web app.

## 4. Result

Long-running sessions no longer fail randomly when the access token expires — the refresh happens transparently, exactly once even under concurrent requests, and the user is only ever bounced to `/login` when the session is genuinely unrecoverable.
