-- TimeForge — Row-Level Security setup (Phase 2 layer 4 / Phase 3 §6).
-- Run AFTER `prisma migrate` with an OWNER/superuser connection (DIRECT_URL):
--   npm run db:rls
-- Idempotent: safe to run repeatedly.

-- 1) Restricted application role (must NOT be superuser / NOT BYPASSRLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timeforge_app') THEN
    CREATE ROLE timeforge_app LOGIN PASSWORD 'app_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO timeforge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO timeforge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO timeforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO timeforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO timeforge_app;

-- 2) Enable + FORCE RLS and create tenant-isolation policies.
--    Policy key: current_setting('app.tenant_id') — set per request via SET LOCAL.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'organizations', 'organization_settings', 'users',
    'roles', 'refresh_tokens', 'audit_log', 'idempotency_keys',
    -- Core organization (Phase 6)
    'departments', 'teams', 'clients', 'projects', 'work_categories', 'holidays',
    -- Time tracking & timesheets (Phase 7/8)
    'time_entries', 'timesheets',
    -- Daily Scrum (Phase 9 + task/blocker expansion)
    'scrum_entries', 'scrum_tasks', 'scrum_blockers',
    -- Supervisor approval, KPI, payroll (Phase 9)
    'approvals', 'kpi_templates', 'kpi_progress',
    'payroll_periods', 'payroll_reports', 'payroll_line_items',
    -- Notifications & AI jobs (Phase 4)
    'notifications', 'ai_jobs', 'ai_audit', 'ai_results',
    -- Session tracking (WorkSession/SessionEvent/SessionAttachment expansion)
    'work_sessions', 'session_events', 'session_attachments'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
    $f$, t);
  END LOOP;
END
$$;

-- 3) Tenants root: a connection may only see its own tenant row.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

-- Note: join tables (role_permissions, user_roles) and the global `permissions`
-- catalog are not tenant-scoped; access is governed through their parents.
