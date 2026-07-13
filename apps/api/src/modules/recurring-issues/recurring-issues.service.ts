import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { RecurringIssueQuery } from './dto';

@Injectable()
export class RecurringIssuesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(p: AuthPrincipal, query: RecurringIssueQuery) {
    const where: Prisma.RecurringIssueWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      status: query.status ?? 'OPEN',
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.from || query.to
        ? {
            lastOccurrence: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (!this.can(p, 'scrum:read_org')) {
      const teamIds = await this.teamUserIds(p);
      where.employeeIds = { hasSome: teamIds };
    }

    return this.prisma.recurringIssue.findMany({
      where,
      orderBy: [{ lastOccurrence: 'desc' }],
      take: 100,
    });
  }

  async getSummary(p: AuthPrincipal) {
    const items = await this.findAll(p, {});
    return {
      total: items.length,
      blockers: items.filter((i) => i.category === 'BLOCKER').length,
      delays: items.filter((i) => i.category === 'DELAY').length,
      increasing: items.filter((i) => i.trend === 'INCREASING').length,
    };
  }

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async teamUserIds(p: AuthPrincipal): Promise<string[]> {
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        supervisorId: p.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return [p.userId, ...reports.map((r) => r.id)];
  }
}
