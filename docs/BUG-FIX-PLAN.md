# Bug Fix Plan: Performance Insights + Finance Report Slowness

**Date:** 2026-07-13
**Status:** ✅ All fixes implemented + typechecked

---

## Issue 1: New Accounts Show Fake Performance Data ("Connected to Eli")

### Root Cause

The performance page displays **hardcoded static values** for every user, regardless of whether they have any actual performance data. When a new account is created (registered into the same tenant/org as the seeded demo user Eli Employee), the performance page shows identical numbers — making it appear the data is "from Eli."

There are **5 distinct sources** of fake data:

| # | File | Lines | Issue |
|---|---|---|---|
| 1 | `apps/api/src/modules/performance/performance.service.ts` | 296-303 | `getMetrics()` returns hardcoded: punctuality(96%), utilization(78%), alignment(92%), scrum(95%), timesheet(100%) |
| 2 | `apps/api/src/modules/performance/performance.service.ts` | 214, 219, 230 | Hardcoded trend strings `'+2.4% vs last week'` regardless of actual deltas |
| 3 | `apps/web/features/reports/components/PerformanceOversightContent.tsx` | 215, 232, 248, 271 | Frontend fallbacks `?? "94%"`, `?? "98%"`, `?? "14/18"`, `?? "75%"` |
| 4 | `apps/web/features/reports/components/PerformanceOversightContent.tsx` | 470-502 | "Module Score Breakdown" is 100% hardcoded ("Sr. Product Engineer", score 33.7) |
| 5 | `apps/api/src/modules/performance/performance.service.ts` | 534-539 | Coach advice `actionGuide`/`strengths`/`areasForImprovement` hardcoded when AI results exist |

**Additional issue:** `getDashboardData()` queries (lines 135-148) lack `tenantId`/`organizationId` filters — defense-in-depth gap.

### Fix A: `getMetrics()` — Replace Hardcoded Values with Real DB Queries

**File:** `apps/api/src/modules/performance/performance.service.ts`
**Lines:** 276-304

**Current code (hardcoded):**
```ts
return {
  punctuality: { percentage: 96, change: '+2%', trend: 'up' },
  focusScore: { percentage: focusScore, change: '-1%', trend: 'down' },
  billableUtilization: { percentage: 78, change: '0%', trend: 'stable' },
  targetAlignment: { percentage: 92, change: '+4%', trend: 'up' },
  dailyScrumCompletion: { percentage: 95, change: '+1%', trend: 'up' },
  timesheetCompletion: { percentage: 100, change: '0%', trend: 'stable' },
};
```

**New implementation — compute all 6 metrics from real data:**

1. **Punctuality** — From `Timesheet` records: count timesheets where `submittedAt IS NOT NULL AND submittedAt <= periodEnd` (on-time) / total timesheets. Return 0 if no timesheets exist.

2. **Focus Score** — Already computed correctly from `WorkSession` (lines 282-294). Keep as-is.

3. **Billable Utilization** — From `WorkSession`: `(totalActiveMins / (totalActiveMins + totalBreakMins)) * 100`. Return 0 if no sessions.

4. **Target Alignment** — From `KpiProgress`: average of `(currentValue / targetValue) * 100` across all KPI records. Return 0 if no KPIs.

5. **Daily Scrum Completion** — From `ScrumTask`: `COMPLETED count / total count * 100`. Return 0 if no tasks.

6. **Timesheet Completion** — From `Timesheet`: `SUBMITTED + APPROVED + PAYROLL_READY count / total count * 100`. Return 0 if no timesheets.

**Required queries (add to `getMetrics`):**
```ts
const [workSessions, kpiProgresses, scrumTasks, timesheets] = await Promise.all([
  this.prisma.workSession.findMany({
    where: { userId: { in: userIds }, tenantId: p.tenantId, organizationId: p.organizationId },
  }),
  this.prisma.kpiProgress.findMany({
    where: { userId: { in: userIds }, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
  }),
  this.prisma.scrumTask.findMany({
    where: { employeeId: { in: userIds }, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
  }),
  this.prisma.timesheet.findMany({
    where: { userId: { in: userIds }, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
  }),
]);
```

**Compute each metric:**
```ts
// Punctuality: on-time submission rate
const submittedOnTime = timesheets.filter(t =>
  t.submittedAt && t.periodEnd && new Date(t.submittedAt) <= new Date(t.periodEnd)
).length;
const punctuality = timesheets.length > 0
  ? Math.round((submittedOnTime / timesheets.length) * 100) : 0;

// Focus Score: (already exists, keep as-is)

// Billable Utilization: active time ratio
const totalActive = workSessions.reduce((s, ws) => s + (ws.sessionDurationMinutes || 0), 0);
const totalBreak = workSessions.reduce((s, ws) => s + (ws.breakMinutes || 0), 0);
const billableUtilization = (totalActive + totalBreak) > 0
  ? Math.round((totalActive / (totalActive + totalBreak)) * 100) : 0;

// Target Alignment: avg KPI attainment
let kpiAttainmentSum = 0;
kpiProgresses.forEach(k => {
  const target = Number(k.targetValue || 1);
  const current = Number(k.currentValue || 0);
  kpiAttainmentSum += Math.min(100, Math.round((current / target) * 100));
});
const targetAlignment = kpiProgresses.length > 0
  ? Math.round(kpiAttainmentSum / kpiProgresses.length) : 0;

// Daily Scrum Completion
const completedTasks = scrumTasks.filter(t => t.taskStatus === 'COMPLETED').length;
const dailyScrumCompletion = scrumTasks.length > 0
  ? Math.round((completedTasks / scrumTasks.length) * 100) : 0;

// Timesheet Completion
const submittedOrApproved = timesheets.filter(t =>
  ['SUBMITTED', 'APPROVED', 'PAYROLL_READY'].includes(t.status)
).length;
const timesheetCompletion = timesheets.length > 0
  ? Math.round((submittedOrApproved / timesheets.length) * 100) : 0;
```

**Remove** the hardcoded `change` and `trend` fields (set to `null`/`'stable'`).

### Fix B: `getDashboardData()` — Remove Hardcoded Trend Strings

**File:** `apps/api/src/modules/performance/performance.service.ts`
**Lines:** 203-234

Replace hardcoded `change` strings with `null` when no historical comparison is available.

### Fix C: Add `tenantId`/`organizationId` to `getDashboardData()` Queries

**File:** `apps/api/src/modules/performance/performance.service.ts`
**Lines:** 135-149

Add `tenantId: p.tenantId, organizationId: p.organizationId` and `deletedAt: null` to all 4 queries.

### Fix D: Frontend Fallback Values

**File:** `apps/web/features/reports/components/PerformanceOversightContent.tsx`

Replace `?? "94%"` etc. with `?? "0%"`, and show a "No performance data yet" empty state when all values are zero.

### Fix E: "Module Score Breakdown" — Make Dynamic

**File:** `apps/web/features/reports/components/PerformanceOversightContent.tsx`
**Lines:** 470-502

Replace hardcoded "Sr. Product Engineer" section with dynamic data from `kpiRows`. Show empty state when no KPIs exist.

### Fix F: Coach Advice Hardcoded Fields

**File:** `apps/api/src/modules/performance/performance.service.ts`
**Lines:** 530-541

Return `null` for `actionGuide`/`strengths`/`areasForImprovement` when AI result exists. Frontend should conditionally render.

---

## Issue 2: Finance Report Slow on Vercel + Internal Server Error on Localhost

### Root Cause

The finance reports page fires **5 simultaneous heavy API calls** on mount, each executing multiple database queries that load full record sets into Node.js memory and compute aggregates in JavaScript instead of SQL.

### Fix G: `getDashboardData` — Use SQL Aggregates + Add Filters

**File:** `apps/api/src/modules/reports/reports.service.ts`
**Lines:** 87-170

1. Add `deletedAt: null` to timesheet query
2. Replace `payrollLineItem.findMany` + `reduce` with `aggregate({ _sum: { estimatedPay: true } })`
3. Replace department nested eager load with `groupBy`
4. Replace N+1 audit log actor queries with single batch query

### Fix H: `getFinanceDashboard` — Use `count()` Instead of `findMany()`

**File:** `apps/api/src/modules/reports/reports.service.ts`
**Lines:** 871-986

Replace 4 `timesheet.findMany` calls with `timesheet.count` for attendance and compliance calculations.

### Fix I: Frontend — Add `staleTime` and Conditional Loading

**File:** `apps/web/features/finance-reports/components/FinanceReportsContent.tsx`
**Lines:** 112-135

Add `staleTime: 5 * 60 * 1000` (5 min) to all queries. Only fetch attendance/history when on their tabs.

### Fix J: `getFinancePayrollReport` — Add `deletedAt` Filter

**File:** `apps/api/src/modules/reports/reports.service.ts`
**Lines:** 1030-1040

Add `deletedAt: null` to nested `reports` include.

---

## Implementation Order

1. Fix A — `getMetrics()` real DB queries
2. Fix C — Add tenant/org scoping
3. Fix B — Remove hardcoded trend strings
4. Fix D — Frontend fallback values
5. Fix E — Dynamic Module Score Breakdown
6. Fix F — Coach advice hardcoded fields
7. Fix G — `getDashboardData` SQL aggregates
8. Fix H — `getFinanceDashboard` count queries
9. Fix J — `getFinancePayrollReport` deletedAt filter
10. Fix I — Frontend staleTime/conditional loading
11. Verify — Start dev servers, test with new employee account

## Files to Modify

| File | Fixes |
|---|---|
| `apps/api/src/modules/performance/performance.service.ts` | A, B, C, F |
| `apps/web/features/reports/components/PerformanceOversightContent.tsx` | D, E |
| `apps/api/src/modules/reports/reports.service.ts` | G, H, J |
| `apps/web/features/finance-reports/components/FinanceReportsContent.tsx` | I |

---

## Implementation Log

**Completed:** 2026-07-13
**Verification:** `npx tsc --noEmit` passes on both `apps/api` (tsconfig.app.json) and `apps/web` (tsconfig.json). No ESLint config exists in the project.

### Fix A: `getMetrics()` — Real DB queries
- **File:** `apps/api/src/modules/performance/performance.service.ts`
- Replaced hardcoded `punctuality(96)`, `billableUtilization(78)`, `targetAlignment(92)`, `dailyScrumCompletion(95)`, `timesheetCompletion(100)` with real DB computations
- Punctuality: timesheet on-time submission rate (`submittedAt <= periodEnd`)
- Billable Utilization: `totalActive / (totalActive + totalBreak)` from WorkSession
- Target Alignment: avg KPI attainment (`currentValue / targetValue`) from KpiProgress
- Scrum Completion: `COMPLETED tasks / total tasks` from ScrumTask
- Timesheet Completion: `SUBMITTED+APPROVED+PAYROLL_READY / total` from Timesheet
- All return 0 when no data exists (clean slate for new accounts)
- Focus Score was already computed from real data — kept as-is
- Removed `change` and `trend` fields (set to null)

### Fix B: `getDashboardData()` — Removed hardcoded trend strings
- **File:** `apps/api/src/modules/performance/performance.service.ts`
- Replaced `'+2.4% vs last week'`, `'+4% vs last week'`, `'On track for Quarterly Bonus'` with `null`

### Fix C: `getDashboardData()` — Added tenant/org scoping
- **File:** `apps/api/src/modules/performance/performance.service.ts`
- Added `tenantId: p.tenantId, organizationId: p.organizationId` and `deletedAt: null` to all 4 queries (kpiProgress, timesheet, scrumTask, workSession)

### Fix D: Frontend fallback values
- **File:** `apps/web/features/reports/components/PerformanceOversightContent.tsx`
- Replaced all hardcoded fallbacks: `score 75→0`, `KPIs 8→0`, `efficiency "94%→0%"`, `attendance "98%→0%"`, `task completion "14/18→0/0"`, `task progress bar 78→0`, `KPI score "75%→0%"`
- Made trend indicators conditional on non-null values (removed hardcoded green/red arrows with fake percentages)
- Metric card row trends: replaced hardcoded `"+2%"`, `"-1%"`, `"0%"`, `"+4%"` with dynamic conditional rendering

### Fix E: Module Score Breakdown — Dynamic
- **File:** `apps/web/features/reports/components/PerformanceOversightContent.tsx`
- Replaced hardcoded "Sr. Product Engineer" / weight 1.00 / raw score 33.7 with `kpiRows.map()` rendering
- Shows "No KPI data available yet." empty state when `kpiRows.length === 0`

### Fix F: Coach advice — Conditional rendering
- **Backend:** `performance.service.ts` — replaced hardcoded `actionGuide`/`strengths`/`areasForImprovement` arrays with `null` when AI result exists
- **Frontend:** `PerformanceOversightContent.tsx` — made `actionGuide`, `strengths`, `areasForImprovement` sections conditional with `{coach?.actionGuide && coach.actionGuide.length > 0 && (...)}` guards

### Fix G: `getDashboardData` — SQL aggregates
- **File:** `apps/api/src/modules/reports/reports.service.ts`
- **Attendance Rate:** Replaced `timesheet.findMany` + JS `filter` with `timesheet.count` (approved vs total). Added `deletedAt: null` filter
- **Labor Cost:** Replaced `payrollLineItem.findMany` + `reduce` with `payrollLineItem.aggregate({ _sum: { estimatedPay: true } })`
- **Labor Distribution:** Replaced nested `department.findMany(include: users(include: payrollLineItems))` with `payrollLineItem.groupBy` + batch `user.findMany` for department mapping
- **Compliance Score:** Replaced second `timesheet.findMany` with two parallel `timesheet.count` calls
- **Audit Logs:** Replaced N+1 `Promise.all(logs.map(async log => prisma.user.findFirst()))` with single batch `user.findMany({ where: { id: { in: actorIds } } })`

### Fix H: `getFinanceDashboard` — SQL count
- **File:** `apps/api/src/modules/reports/reports.service.ts`
- **Compliance:** Replaced `timesheet.findMany` × 2 + JS `calcCompliance` with 4 parallel `timesheet.count` calls (current/prev × total/flagged)
- **Attendance:** Replaced `timesheet.findMany` × 2 + JS `calcAttendance` with 4 parallel `timesheet.count` calls (current/prev × approved/total)

### Fix I: Frontend staleTime
- **File:** `apps/web/features/finance-reports/components/FinanceReportsContent.tsx`
- Added `staleTime: 5 * 60 * 1000` (5 min) to dashboard, payroll, overtime queries
- Added `staleTime: 2 * 60 * 1000` (2 min) to history and attendance queries
- Added `enabled: activeTab === "history"` and `enabled: activeTab === "attendance"` to prevent fetching off-screen data

### Fix J: `getFinancePayrollReport` — deletedAt filter
- **File:** `apps/api/src/modules/reports/reports.service.ts`
- Added `where: { deletedAt: null }` to nested `reports` include in `PayrollReport` query

---

## Issue 3: 401 Auth Cascade on Production (Railway + Vercel)

### Root Cause

When the access token expires (15-min TTL), the frontend interceptor tries `POST /auth/refresh`. In a cross-site deployment (Vercel frontend → Railway API), the browser may block the httpOnly `refresh_token` cookie from being sent. This causes `/auth/refresh` to return 401 "Missing refresh token", which clears the session and redirects to login — all endpoints return 401 simultaneously.

A secondary bug: expired JWTs threw raw `TokenExpiredError` (not an `HttpException`), which the exception filter returned as 500 instead of 401. The frontend interceptor only triggers refresh on 401, not 500.

### Fix K: `JwtAuthGuard.handleRequest` — Always throw `UnauthorizedException`
- **File:** `apps/api/src/common/guards/jwt-auth.guard.ts`
- Changed `throw err instanceof Error ? err : new UnauthorizedException()` to always throw `new UnauthorizedException(err instanceof Error ? err.message : 'Unauthorized')`
- Ensures expired/invalid JWTs return 401 (not 500), so the frontend interceptor correctly triggers refresh

### Fix L: Return refresh token in response body + frontend body fallback
- **Backend:** `apps/api/src/modules/auth/auth.controller.ts` — login and refresh endpoints now return `refreshToken` in the response body (in addition to the httpOnly cookie)
- **Frontend:** `apps/web/lib/api/client.ts` — `refreshAccessToken()` sends `{ refreshToken }` in the request body as a fallback when the cookie isn't sent
- **Frontend:** `apps/web/features/auth/api/auth.service.ts` — `login()` and `refresh()` store the refresh token in memory via `setRefreshTokenMemory()`
- **Frontend:** `apps/web/providers/auth-provider.tsx` — `clearSession()` also clears the in-memory refresh token

### Fix M: Add `tokenHash` index to `RefreshToken` model
- **File:** `prisma/schema.prisma`
- Added `@@index([tokenHash])` — the refresh flow does `findFirst({ where: { tokenHash } })` which was a full table scan
- Requires `prisma migrate dev` to apply

### Deployment note
After deploying, run `prisma migrate dev` (or `prisma migrate deploy` in production) to apply the new index. The body-based refresh fallback works immediately without migration.
