# AI Processing Pipeline — Reliability & Idempotency Review

**Date:** 2026-07-10  
**Scope:** BullMQ AI job queues (`ai`, `finance-ai`), their producers (`AiService`, `FinanceAiService`) and workers (`AiProcessor`, `FinanceAiProcessor`).

---

## 1. Architecture overview

```
┌─ API (HTTP) ──────────────────┐   ┌─ Worker (BullMQ) ────────────────┐
│                                │   │                                  │
│  AiService.triggerJob()  ──────┼──▶│  AiProcessor.process()           │
│  (POST /v1/ai/jobs)           │   │  • Feature handler → OpenAI      │
│                                │   │  • $tx: AiResult + AiAudit      │
│                                │   │  • Status: QUEUED→SUCCEEDED     │
│  FinanceAiService.report() ────┼──▶│  FinanceAiProcessor.process()   │
│  (POST /v1/finance-ai/report)  │   │  • $tx: AiResult + AiAudit      │
│                                │   │  • Notifications (completion)   │
│                                │   │  • Status: QUEUED→SUCCEEDED     │
└────────────────────────────────┘   └──────────────────────────────────┘
```

Both queues already existed with producers and workers. The **workers** live in `apps/worker/src/processors/` and were already registered in `worker.module.ts`. No new files were needed.

---

## 2. Problems found

### 2.1 No idempotency guard on worker retry

Both `AiProcessor` and `FinanceAiProcessor` would unconditionally re-execute their full workflow on every BullMQ retry attempt:

- **AiProcessor:** Would call OpenAI again (duplicate external AI request), then crash with a Prisma `P2002` unique-constraint violation when `aiResult.create()` tried to insert a duplicate `aiJobId`.
- **FinanceAiProcessor:** Same — `aiResult.create()` would fail on retry. Additionally it used `upsert` for the AiJob status update (wrong pattern — the producer already creates the job), which could create orphan records.

**Files affected:** `apps/worker/src/processors/ai.processor.ts`, `apps/worker/src/processors/finance-ai.processor.ts`

### 2.2 Non-atomic producer writes

**`AiService.triggerJob()`** performed idempotency check, AiJob creation, audit-log creation, and idempotency-key save as separate individual Prisma calls. A race between two requests with different idempotency keys could create duplicate AiJob records.

**`FinanceAiService.report()`** had the same problem — no idempotency key support at all, no transaction, and notifications sent synchronously at queue-time (even if the worker later fails).

**Files affected:** `apps/api/src/modules/ai/ai.service.ts`, `apps/api/src/modules/finance-ai/finance-ai.service.ts`

### 2.3 Premature notifications

`FinanceAiService.report()` fanned out "AI Financial Report Ready" notifications to every FINANCE-role user **before the worker had persisted anything**. If the worker crashed, users received a false positive.

**File affected:** `apps/api/src/modules/finance-ai/finance-ai.service.ts`

### 2.4 Missing idempotency key on finance-ai endpoint

The `POST /v1/finance-ai/report` endpoint had no `Idempotency-Key` header support, unlike `POST /v1/ai/jobs`. Clients had no way to safely retry the request.

**File affected:** `apps/api/src/modules/finance-ai/finance-ai.controller.ts`

---

## 3. Changes made

### 3.1 `apps/worker/src/processors/ai.processor.ts` — Idempotent worker

Added a multi-layer idempotency guard before any external call or DB write:

1. **Status check** — if AiJob is already `SUCCEEDED`, skip immediately.
2. **Partial-completion recovery** — if `AiResult` already exists (crashed after create but before status update), recover status to `SUCCEEDED` and return. No duplicate OpenAI call.
3. **Optimistic claim** — `updateMany` with `WHERE status IN ('QUEUED', 'FAILED')` so that only one retry attempt claims the job.
4. **Atomic persist** — AiResult + AiAudit + status update wrapped in `$transaction`. A final idempotency check inside the transaction catches any concurrent retry that created the result between check and persist.
5. **Error handling** — FAILED status update is best-effort (`.catch(noop)`), and the error is rethrown for BullMQ's retry mechanism.

**The only remaining duplicate-external-call window:** between step 2 (no result found) and the `$transaction` — a crash after OpenAI responds but before the transaction starts. This is narrow and accepted; the AiJobId `@unique` constraint on `AiResult` prevents any duplicate DB records.

### 3.2 `apps/worker/src/processors/finance-ai.processor.ts` — Idempotent worker + notifications

Same idempotency pattern as the AiProcessor, plus:

- **Replaced `upsert` with `updateMany`** for the job-claim phase (the producer always creates the AiJob first).
- **Moved notification fan-out** from the HTTP producer to the worker, after the atomic persist succeeds. If the worker crashes after persist, the retry hits the partial-completion recovery and skips the duplicate notification.
- **Injected `NotificationsService`** — already provided by `WorkerModule`.

### 3.3 `apps/api/src/modules/ai/ai.service.ts` — Atomic producer

Refactored `triggerJob()` to wrap idempotency check + AiJob creation + idempotency-key upsert + audit log in a single `$transaction`. The BullMQ `queue.add()` remains outside the transaction (Redis call).

The `checkIdempotency` and `saveIdempotency` helpers now accept a transaction client parameter instead of using `this.prisma` directly.

### 3.4 `apps/api/src/modules/finance-ai/finance-ai.service.ts` — Atomic producer + idempotency

- **Removed notification fan-out** from `report()` (moved to worker).
- **Added `Idempotency-Key` support** — optional header; when provided, the key is prefixed with `finance-ai:` and stored in the `IdempotencyKey` table (24h TTL). Subsequent requests with the same key return the existing `jobId` without creating a new job.
- **Wrapped** AiJob creation + idempotency-key upsert + audit log in `$transaction`.

### 3.5 `apps/api/src/modules/finance-ai/finance-ai.controller.ts` — API header

Added optional `@Headers('Idempotency-Key')` parameter to the `report()` endpoint, matching the pattern used by `POST /v1/ai/jobs`. Documented with Swagger `@ApiHeader`.

---

## 4. Idempotency layers summary

| Layer | Mechanism | Scope |
|---|---|---|
| **Idempotency key** | `IdempotencyKey` table, `@@unique([tenantId, key])`, 24h TTL | Producer: HTTP request dedup |
| **BullMQ jobId** | `queue.add(..., { jobId })` | Queue: prevents duplicate Redis entries |
| **Optimistic claim** | `updateMany(where: { status: { in: [QUEUED,FAILED] } })` | Worker: prevents concurrent processing |
| **Partial-completion recovery** | Check `AiResult` existence before external call | Worker: avoids duplicate API calls on retry |
| **Atomic persist** | `$transaction` with final idempotency check | Worker: AiResult + AiAudit + status are all-or-nothing |
| **Unique constraint** | `AiResult.aiJobId @unique`, `AiAudit.aiJobId @unique` | Database: ultimate backstop |  

---

## 5. Retry scenario verification

| Scenario | Before | After |
|---|---|---|
| **Retry after crash before AiResult** | Calls OpenAI again, creates duplicate result → P2002 crash | Calls OpenAI again (narrow window), `$transaction` safety net catches duplicate |
| **Retry after AiResult created but before status update** | Calls OpenAI again → P2002 crash | Recovery path: detects existing AiResult, updates status to SUCCEEDED, returns |
| **Retry after AiResult + AiAudit + status all committed** | Calls OpenAI again → P2002 crash | Status check: SUCCEEDED, skips entirely |
| **Finance AI: retry after notification sent but before status update** | Duplicate notifications | Notification sent only inside worker after atomic persist; retry recovery skips |
| **Finance AI: duplicate HTTP POST (same Idempotency-Key)** | Creates duplicate AiJob + audit | Transactional check returns existing jobId |
| **Producer crash after DB write but before BullMQ enqueue** | Job stuck in QUEUED forever | Idempotency key allows client retry → gets existing jobId; BullMQ dedup prevents double-enqueue |

---

## 6. Files changed

| File | Change type |
|---|---|
| `apps/worker/src/processors/ai.processor.ts` | Modified — added idempotency guards + `$transaction` |
| `apps/worker/src/processors/finance-ai.processor.ts` | Modified — added idempotency guards + `$transaction` + notifications |
| `apps/api/src/modules/ai/ai.service.ts` | Modified — `triggerJob()` now uses `$transaction` |
| `apps/api/src/modules/finance-ai/finance-ai.service.ts` | Modified — added idempotency key, removed premature notifications, `$transaction` |
| `apps/api/src/modules/finance-ai/finance-ai.controller.ts` | Modified — added `Idempotency-Key` header |
