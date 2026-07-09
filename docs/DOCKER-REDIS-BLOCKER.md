# Blocked: Redis / Docker Desktop setup for AI worker

**Status:** Paused, needs manual step before resuming.
**Date:** 2026-07-08

## Goal

User added `OPENAI_API_KEY` to `.env` and wants the AI features to actually
run end-to-end (worker picks up the key, processes real BullMQ jobs instead
of stub mode).

## Blocker

The local `redis-server.exe` (`C:\Program Files\Redis\redis-server.exe`) is
version **3.0.504** — BullMQ requires Redis **5.0+**. The worker fails to
connect to the queue:

```
Error: Redis version needs to be greater or equal than 5.0.0 Current: 3.0.504
```

Plan was to run Redis 7 via Docker instead (matches `docker-compose.yml`'s
`redis: image: redis:7` service, port 6379), since the repo already assumes
Docker for full-stack dev.

Docker Desktop failed to start with:

```
starting services: initializing Inference manager: listening on
unix://C:/Users/USER/AppData/Local/Docker/run/dockerInference: remove
C:/Users/USER/AppData/Local/Docker/run/dockerInference: The file cannot be
accessed by the system.
```

This is a stuck reparse-point (leftover unix-socket file) in Docker's
runtime scratch folder that Docker Desktop can't clean up itself.
`del`, `Remove-Item -Force`, and `fsutil reparsepoint delete` all fail on it
even with no Docker processes running — likely a lingering OS-level handle
that only clears on reboot.

## How to resume

1. **Reboot Windows** (clears whatever holds the handle on the stuck file).
2. Delete the runtime scratch folder (safe — Docker recreates it, it's not
   your images/containers/volumes):
   ```powershell
   Remove-Item "C:\Users\USER\AppData\Local\Docker\run" -Recurse -Force
   ```
3. Launch Docker Desktop, wait for the engine to report ready
   (`docker info` succeeds).
4. Start Redis 7:
   ```bash
   docker rm -f timeforge-redis-dev 2>&1
   docker run -d --name timeforge-redis-dev -p 6379:6379 redis:7
   ```
5. Kill the old Redis 3.x process if it's still running:
   ```powershell
   taskkill /F /IM redis-server.exe
   ```
6. Start the worker (not wired into `.claude/launch.json` since it has no
   HTTP port — start directly):
   ```bash
   npm run start:worker
   ```
7. Confirm in worker logs: no more `ECONNREFUSED` / Redis version errors,
   and `"TimeForge worker started — listening for BullMQ jobs."` with no
   subsequent connection errors.
8. Trigger an AI feature from the UI (e.g. Finance AI Insights → Generate AI
   Report) and confirm the worker log shows a real OpenAI call, not stub
   mode (see `apps/api/src/modules/ai/ai.service.ts` — falls back to stub
   when `OPENAI_API_KEY` is absent, so a real completion confirms the key
   is live).

## Alternative if Docker keeps failing

Skip Docker; install [Memurai](https://www.memurai.com/) (Redis-compatible,
native Windows) or run Redis inside WSL2 instead. Either just needs to
listen on `127.0.0.1:6379` — nothing else in the stack cares which backend
provides it.
