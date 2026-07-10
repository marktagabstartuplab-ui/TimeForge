# Payroll Processing Consistency Fix Report

**Date:** 2026-07-10
**Scope:** Finding #7 from the Production Readiness Tracker (High) — stale UI after flagging payroll discrepancies, plus a broader consistency review of the two payroll-processing implementations.
**Status:** ✅ Fixed and verified live.

---

## 1. Review: the two implementations

`apps/web/features/payroll-processing/components/PayrollProcessingContent.tsx` (HR's generate/lock/export wizard) and `apps/web/features/finance/components/FinancePayrollProcessingContent.tsx` (Finance's validate/approve/reject/send-to-bank pipeline) are genuinely different tools for different roles, built on the same shared period/report data. They're not accidental duplicates of each other — they render different data shapes and expose different actions — so this was a **consistency review**, not a merge.

Compared every mutation across both files for cache invalidation, notification wording, loading states, and business-logic guards.

## 2. Bug found and fixed: stale UI after flagging

`PayrollProcessingContent.tsx`'s `flagMutation.onSuccess` set a toast but never called `invalidateAll()` — unlike every other mutation in the same file (`createPeriodMutation`, `generateMutation`, `lockMutation`, all call it). Result: after flagging discrepant rows, the employee table kept showing pre-flag data until something else happened to trigger a refetch.

**Fix:** one line — `invalidateAll();` added to `flagMutation.onSuccess`, matching the exact pattern already used by every sibling mutation in the file.

## 3. Consistency gap found and fixed: Recalculate guard parity

HR's Recalculate button disables when `activePeriod?.status === "EXPORTED"` (`canRecalculate`). Finance's Recalculate button had no equivalent guard — checked only `generateMutation.isPending`. Verified this isn't cosmetic: the backend (`payroll.service.ts` `generateReport`, rule BR-PAY-04) throws a 409 for exactly this case, and `dashboard.periodStatus` (Finance's dashboard payload) is literally `period.status` — the same field HR's guard already reads, just under a different property name. Added `canRecalculate = dashboard?.periodStatus !== "EXPORTED"` to Finance and applied it to its Recalculate button, so both components now refuse the same invalid action in the same way instead of one showing a would-be-rejected button and letting the error surface only after the request round-trips.

## 4. Checked, found already consistent (left untouched)

- **Cache invalidation** — every other mutation in both files (create period, generate, lock/validate/approve/reject/send-to-bank) already calls its own `invalidateAll()`. Export mutations in both files correctly *don't* invalidate (export queues an async job, doesn't change displayed state) — consistent, not a gap.
- **Notifications/toasts** — identical pattern in both files (`setToast` with `err?.message || "<fallback>"` on error), matching wording for the shared actions (create period, recalculate).
- **Loading states** — HR shows a 3-row table skeleton for its report query; Finance shows 3 summary-card skeletons for its dashboard query. These differ because the two components display genuinely different data shapes (a line-item table vs. a dashboard with cards + table + audit log) — not a bug, a legitimate reflection of different content. Left as-is per "preserve existing UI design."

## 5. Live Verification

1. `npx tsc --noEmit` clean on the web app after both edits.
2. Logged into the real running app, navigated to `/admin/payroll-processing`, clicked **Flag Discrepancy**.
3. Confirmed via network log: `POST /payroll/reports/:id/flag-discrepancies` returned `200 OK`, followed **6ms later** by an automatic `GET /payroll/periods/:id/report` — the signature of React Query's `invalidateQueries()` triggering an immediate refetch of the active report query. This is the concrete fix in action, not just code review.
4. Hit an unrelated, pre-existing bug while testing as `hr@demo.test`: the live HR role is missing several payroll permissions in the database (documented separately in the tracker, not fixed here — out of scope for this task, and deserves a dedicated pass across all roles rather than a one-off patch). Worked around it by testing as `admin@demo.test` (wildcard permissions) to isolate and confirm the actual fix under test.

## 6. Result

Flagging payroll discrepancies now updates the employee table immediately, matching every other mutation's behavior in the same component. Finance's Recalculate button now refuses the same invalid state HR's already refused, instead of relying on the backend's error response to catch it after the fact.
