# TimeForge — Manual Verification Guide

## Prerequisites

- Node 20+, npm 10+
- PostgreSQL (Supabase) — connection string in `DATABASE_URL`
- Redis 7+ — connection string in `REDIS_URL`
- SMTP credentials or Supabase service role key (for email)

---

## 1. Environment Configuration

### Required
```bash
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=<64-char random>
JWT_REFRESH_SECRET=<64-char random>
CORS_ORIGINS=http://localhost:3001
```

### Optional but recommended
```bash
ARGON2_MEMORY_COST=65536          # default; increase for higher security
OPENAI_API_KEY=sk-...              # omit for stub mode
REDIS_URL=redis://localhost:6379
SMTP_USER=... SMTP_PASS=...        # or SUPABASE_SERVICE_ROLE_KEY
```

---

## 2. Database

```bash
# Validate schema
npx prisma validate

# Apply migrations
npx prisma migrate deploy

# Seed
npm run db:seed
```

Verify: `admin@demo.test` / `ChangeMe123!` can log in.

---

## 3. API

```bash
# Start
npm run start:api

# Health check
curl http://localhost:3000/api/v1/health
# → {"status":"healthy",...}

# Swagger
open http://localhost:3000/api/docs
```

### Smoke tests

| Test | Command | Expected |
|---|---|---|
| Login | `curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@demo.test","password":"ChangeMe123!"}'` | 201 + JWT |
| Security logs | `curl http://localhost:3000/api/v1/security/logs -H "Authorization: Bearer $TOKEN"` | 200 + paginated logs |
| Security export | `curl -X POST http://localhost:3000/api/v1/security/export -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"format":"CSV"}'` | 200 + CSV |
| Dashboard | `curl http://localhost:3000/api/v1/dashboard/summary -H "Authorization: Bearer $TOKEN"` | 200 + KPI data |

---

## 4. Worker

```bash
# Start (separate terminal)
npm run start:worker
```

Verify logs show:
- `NotificationsProcessor` registered
- `AiProcessor` registered
- BullMQ connected to Redis

### Email retry test
1. Set `REDIS_URL` to a working Redis
2. Set `SMTP_USER` to an invalid value
3. Trigger a notification (any action that sends email)
4. Verify worker logs: `Failed to deliver notification` → notification status = `FAILED`
5. Set `SMTP_USER` correctly → notification retries → status = `SENT`

---

## 5. Frontend

```bash
cd apps/web
npm run dev
# → http://localhost:3001
```

### Login test
- Navigate to `http://localhost:3001/login`
- Sign in as `admin@demo.test` / `ChangeMe123!`
- Verify redirect to `/dashboard`

### Role-based navigation
- Log in as each seeded role and verify sidebar matches expected items:
  - **Admin**: All items
  - **HR**: Employee management, Timesheets, Approvals
  - **Finance**: Payroll, Finance reports
  - **Supervisor**: Team dashboard, Timesheet review
  - **Employee**: Time tracking, My timesheets, Payslips

---

## 6. Production Security Checks

- [ ] `COOKIE_SECURE=true` (HTTPS)
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` set to frontend domain only (not `*`)
- [ ] Swagger UI disabled or restricted (`SWAGGER_ENABLED=false` in production)
- [ ] JWT secrets are strong random strings (64+ chars)
- [ ] `DATABASE_URL` uses connection pooler for production
- [ ] Redis is not `localhost` in production

---

## 7. Argon2 Memory Cost

The `ARGON2_MEMORY_COST` env var controls password hashing difficulty:

| Value | Memory used | Security level |
|---|---|---|
| 65536 | ~64 MB | Default (recommended) |
| 131072 | ~128 MB | Higher security, slower |
| 19456 | ~19 MB | Minimum (not recommended for production) |

Default (`65536`) is appropriate for most deployments. Increase on dedicated hardware.

---

## 8. Rollback

```bash
# Database rollback
npx prisma migrate down

# Previous API version
git revert HEAD --no-commit
```

Keep the previous `.env` backup and deployment artifact for at least 72 hours post-deployment.
