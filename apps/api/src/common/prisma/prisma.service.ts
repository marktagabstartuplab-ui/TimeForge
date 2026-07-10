import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getContext } from '../context/request-context';

/**
 * Every model that carries tenant_id — auto-scoped (Phase 2 layer 3).
 * Kept in sync with prisma/schema.prisma; a test asserts this (see
 * apps/api/src/common/prisma/prisma.service.spec.ts) so an unscoped model
 * added later fails CI instead of silently relying on developer discipline.
 */
export const TENANT_MODELS = new Set([
  'Organization',
  'OrganizationSetting',
  'User',
  'Role',
  'RefreshToken',
  'AuditLog',
  'IdempotencyKey',
  'Department',
  'Team',
  'Client',
  'Project',
  'WorkCategory',
  'Holiday',
  'TimeEntry',
  'Timesheet',
  'ScrumEntry',
  'ScrumTask',
  'ScrumBlocker',
  'WorkSession',
  'SessionEvent',
  'SessionAttachment',
  'Shift',
  'Approval',
  'LeaveRequest',
  'LeaveBalance',
  'KpiTemplate',
  'KpiProgress',
  'PayrollPeriod',
  'PayrollReport',
  'PayrollLineItem',
  'Notification',
  'AiJob',
  'AiAudit',
  'AiResult',
  'SecurityLog',
  'SecurityAlert',
  'GeneratedReport',
]);

const READ_ACTIONS = ['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'];
const BULK_WRITE_ACTIONS = ['updateMany', 'deleteMany'];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Developer-proof tenant filter. Safe subset only (findUnique/update/delete
    // by id rely on the tenant-safe composite keys and Postgres RLS backstop).
    this.$use(async (params, next) => {
      const tenantId = getContext()?.tenantId;
      if (tenantId && params.model && TENANT_MODELS.has(params.model)) {
        if (READ_ACTIONS.includes(params.action) || BULK_WRITE_ACTIONS.includes(params.action)) {
          params.args = params.args ?? {};
          params.args.where = { ...(params.args.where ?? {}), tenantId };
        }
        if (params.action === 'create') {
          params.args.data = { tenantId, ...(params.args.data ?? {}) };
        }
        if (params.action === 'createMany') {
          const data = params.args?.data;
          if (Array.isArray(data)) {
            params.args.data = data.map((d: Record<string, unknown>) => ({ tenantId, ...d }));
          }
        }
      }
      return next(params);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `fn` inside a transaction with the Postgres RLS GUC set
   * (`app.tenant_id`) — the layer-4 backstop. Use for tenant-scoped work once
   * RLS is enabled via prisma/sql/rls.sql.
   */
  async runWithTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
