import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ScrumEntry, ScrumTask, ScrumBlocker } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import {
  CommentScrumEntryDto,
  CreateScrumBlockerDto,
  CreateScrumEntryDto,
  CreateScrumTaskDto,
  ScrumQuery,
  UpdateScrumBlockerDto,
  UpdateScrumEntryDto,
  UpdateScrumTaskDto,
} from './dto';

@Injectable()
export class ScrumService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ───────────────────────────────────────────────────────────────────

  async findAll(p: AuthPrincipal, query: ScrumQuery): Promise<PageResult<ScrumEntry>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.ScrumEntryWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(await this.resolveUserFilter(p, query.userId)),
      ...(query.hasBlockers === 'true' ? { blockers: { not: null } } : {}),
      ...(query.from || query.to
        ? {
            entryDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.scrumEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  async findOne(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    await this.assertCanView(p, entry.userId);
    return entry;
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateScrumEntryDto): Promise<ScrumEntry> {
    const entryDate = new Date(dto.entryDate);
    if (isNaN(entryDate.getTime())) {
      throw new UnprocessableEntityException('entryDate must be a valid date');
    }

    // entryDate must not be in the future (compare by date only, UTC)
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    if (entryDate > today) {
      throw new UnprocessableEntityException('entryDate cannot be in the future');
    }

    // One entry per user per day
    const existing = await this.prisma.scrumEntry.findFirst({
      where: {
        tenantId: p.tenantId,
        userId: p.userId,
        entryDate,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('A scrum entry already exists for this date');
    }

    return this.prisma.scrumEntry.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        entryDate,
        yesterday: dto.yesterday,
        today: dto.today,
        blockers: dto.blockers ?? null,
        notes: dto.notes ?? null,
        progress: dto.progress ?? 0,
        status: dto.status ?? 'NOT_STARTED',
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  /**
   * Owner can edit their own entry on the same day only.
   */
  async update(p: AuthPrincipal, id: string, dto: UpdateScrumEntryDto): Promise<ScrumEntry> {
    const entry = await this.ownEntry(p, id);
    if (entry.version !== dto.version) throw new ConflictException('Version mismatch');

    return this.prisma.scrumEntry.update({
      where: { id },
      data: {
        yesterday: dto.yesterday ?? entry.yesterday,
        today: dto.today ?? entry.today,
        blockers: dto.blockers !== undefined ? (dto.blockers ?? null) : entry.blockers,
        notes: dto.notes !== undefined ? (dto.notes ?? null) : entry.notes,
        progress: dto.progress ?? entry.progress,
        status: dto.status ?? entry.status,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Supervisor adds a comment to an entry on their team (stored in supervisorNote).
   */
  async comment(p: AuthPrincipal, id: string, dto: CommentScrumEntryDto): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');

    // Must be the supervisor or admin
    if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      throw new ForbiddenException('Only supervisors can comment on team scrum entries');
    }

    // Supervisor scope: entry owner must be in their team
    if (!(await this.isInTeam(p, entry.userId))) {
      throw new ForbiddenException('This entry is outside your team');
    }

    if (entry.version !== dto.version) throw new ConflictException('Version mismatch');

    return this.prisma.scrumEntry.update({
      where: { id },
      data: {
        supervisorNote: dto.comment,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  // ── Scrum Tasks ─────────────────────────────────────────────────────────────

  async listTasks(p: AuthPrincipal, entryId: string): Promise<ScrumTask[]> {
    const entry = await this.entryForView(p, entryId);
    return this.prisma.scrumTask.findMany({
      where: { scrumEntryId: entry.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTask(p: AuthPrincipal, entryId: string, dto: CreateScrumTaskDto): Promise<ScrumTask> {
    const entry = await this.ownEntry(p, entryId);
    if (entry.isLocked) throw new ConflictException('Today\'s scrum plan is locked');
    await this.validateProjectRef(p, dto.projectId);

    const task = await this.prisma.scrumTask.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumEntryId: entry.id,
        employeeId: p.userId,
        title: dto.title,
        description: dto.description ?? null,
        expectedOutput: dto.expectedOutput,
        measurement: dto.measurement,
        projectId: dto.projectId ?? null,
        priority: dto.priority ?? 'MEDIUM',
        kpi: dto.kpi ?? null,
        plannedTarget: dto.plannedTarget ?? null,
        estimatedHours: dto.estimatedHours ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.recalcEntryProgress(entry.id, p.userId);
    return task;
  }

  async updateTask(p: AuthPrincipal, id: string, dto: UpdateScrumTaskDto): Promise<ScrumTask> {
    const task = await this.ownTask(p, id);
    if (task.version !== dto.version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(task.scrumEntryId);
    await this.validateProjectRef(p, dto.projectId);

    const wasCompleted = task.taskStatus === 'COMPLETED';
    const willComplete = dto.taskStatus === 'COMPLETED';

    const updated = await this.prisma.scrumTask.update({
      where: { id },
      data: {
        title: dto.title ?? task.title,
        description: dto.description !== undefined ? (dto.description ?? null) : task.description,
        expectedOutput: dto.expectedOutput ?? task.expectedOutput,
        measurement: dto.measurement ?? task.measurement,
        projectId: dto.projectId !== undefined ? (dto.projectId ?? null) : task.projectId,
        taskStatus: dto.taskStatus ?? task.taskStatus,
        completedAt: !wasCompleted && willComplete ? new Date() : wasCompleted && dto.taskStatus && !willComplete ? null : task.completedAt,
        priority: dto.priority ?? task.priority,
        kpi: dto.kpi !== undefined ? (dto.kpi ?? null) : task.kpi,
        plannedTarget: dto.plannedTarget !== undefined ? (dto.plannedTarget ?? null) : task.plannedTarget,
        estimatedHours: dto.estimatedHours ?? task.estimatedHours,
        actualHours: dto.actualHours ?? task.actualHours,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.recalcEntryProgress(task.scrumEntryId, p.userId);
    return updated;
  }

  async completeTask(p: AuthPrincipal, id: string, version: number): Promise<ScrumTask> {
    const task = await this.ownTask(p, id);
    if (task.version !== version) throw new ConflictException('Version mismatch');
    if (task.taskStatus === 'COMPLETED') return task;
    await this.assertEntryUnlocked(task.scrumEntryId);

    const updated = await this.prisma.scrumTask.update({
      where: { id },
      data: {
        taskStatus: 'COMPLETED',
        completedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.recalcEntryProgress(task.scrumEntryId, p.userId);
    return updated;
  }

  async deleteTask(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const task = await this.ownTask(p, id);
    if (task.version !== version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(task.scrumEntryId);
    await this.prisma.scrumTask.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId, version: { increment: 1 } },
    });
    await this.recalcEntryProgress(task.scrumEntryId, p.userId);
  }

  // ── Scrum Blockers ──────────────────────────────────────────────────────────

  async listBlockers(p: AuthPrincipal, entryId: string): Promise<ScrumBlocker[]> {
    const entry = await this.entryForView(p, entryId);
    return this.prisma.scrumBlocker.findMany({
      where: { scrumEntryId: entry.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBlocker(p: AuthPrincipal, entryId: string, dto: CreateScrumBlockerDto): Promise<ScrumBlocker> {
    const entry = await this.ownEntry(p, entryId);
    if (entry.isLocked) throw new ConflictException('Today\'s scrum plan is locked');

    return this.prisma.scrumBlocker.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumEntryId: entry.id,
        title: dto.title,
        description: dto.description ?? null,
        severity: dto.severity ?? 'MEDIUM',
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  async updateBlocker(p: AuthPrincipal, id: string, dto: UpdateScrumBlockerDto): Promise<ScrumBlocker> {
    const blocker = await this.ownBlocker(p, id);
    if (blocker.version !== dto.version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(blocker.scrumEntryId);

    return this.prisma.scrumBlocker.update({
      where: { id },
      data: {
        title: dto.title ?? blocker.title,
        description: dto.description !== undefined ? (dto.description ?? null) : blocker.description,
        severity: dto.severity ?? blocker.severity,
        status: dto.status ?? blocker.status,
        resolvedAt: dto.status === 'RESOLVED' && blocker.status !== 'RESOLVED' ? new Date() : dto.status === 'OPEN' ? null : blocker.resolvedAt,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  async resolveBlocker(p: AuthPrincipal, id: string, version: number): Promise<ScrumBlocker> {
    const blocker = await this.ownBlocker(p, id);
    if (blocker.version !== version) throw new ConflictException('Version mismatch');
    if (blocker.status === 'RESOLVED') return blocker;
    await this.assertEntryUnlocked(blocker.scrumEntryId);

    return this.prisma.scrumBlocker.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  async deleteBlocker(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const blocker = await this.ownBlocker(p, id);
    if (blocker.version !== version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(blocker.scrumEntryId);
    await this.prisma.scrumBlocker.delete({ where: { id } });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async resolveUserFilter(
    p: AuthPrincipal,
    requestedUserId?: string,
  ): Promise<Prisma.ScrumEntryWhereInput> {
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (requestedUserId && !ids.includes(requestedUserId)) {
        throw new ForbiddenException('That user is outside your team');
      }
      return { userId: requestedUserId ?? { in: ids } };
    }
    if (requestedUserId && requestedUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own scrum entries');
    }
    return { userId: p.userId };
  }

  private async assertCanView(p: AuthPrincipal, ownerId: string): Promise<void> {
    if (ownerId === p.userId) return;
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      if ((await this.teamUserIds(p)).includes(ownerId)) return;
    }
    throw new ForbiddenException('Not permitted to view this scrum entry');
  }

  private async isInTeam(p: AuthPrincipal, userId: string): Promise<boolean> {
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      return (await this.teamUserIds(p)).includes(userId);
    }
    return false;
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

  private async ownEntry(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    if (entry.userId !== p.userId) {
      throw new ForbiddenException('You can only modify your own scrum entries');
    }
    return entry;
  }

  private async entryForView(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    await this.assertCanView(p, entry.userId);
    return entry;
  }

  private async ownTask(p: AuthPrincipal, id: string): Promise<ScrumTask> {
    const task = await this.prisma.scrumTask.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!task) throw new NotFoundException('Scrum task not found');
    if (task.employeeId !== p.userId) {
      throw new ForbiddenException('You can only modify your own scrum tasks');
    }
    return task;
  }

  private async ownBlocker(p: AuthPrincipal, id: string): Promise<ScrumBlocker> {
    const blocker = await this.prisma.scrumBlocker.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId },
    });
    if (!blocker) throw new NotFoundException('Scrum blocker not found');
    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: blocker.scrumEntryId } });
    if (!entry || entry.userId !== p.userId) {
      throw new ForbiddenException('You can only modify your own scrum blockers');
    }
    return blocker;
  }

  private async assertEntryUnlocked(scrumEntryId: string): Promise<void> {
    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: scrumEntryId } });
    if (entry?.isLocked) throw new ConflictException("Today's scrum plan is locked");
  }

  private async validateProjectRef(p: AuthPrincipal, projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!project) throw new UnprocessableEntityException('Invalid projectId');
  }

  /**
   * Ports ScrumTaskCard's client-side `updateScrumProgressAndStatus` to the server:
   * progress = round(completed/total*100); 100% locks the day, >0% is IN_PROGRESS.
   */
  private async recalcEntryProgress(scrumEntryId: string, actorId: string): Promise<void> {
    const tasks = await this.prisma.scrumTask.findMany({
      where: { scrumEntryId, deletedAt: null },
      select: { taskStatus: true },
    });
    const total = tasks.length;
    const completed = tasks.filter((t) => t.taskStatus === 'COMPLETED').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const status = progress === 100 ? 'COMPLETED' : progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
    const isLocked = progress === 100;

    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: scrumEntryId } });
    if (!entry) return;

    await this.prisma.scrumEntry.update({
      where: { id: scrumEntryId },
      data: {
        progress,
        status,
        isLocked,
        submittedAt: isLocked && !entry.submittedAt ? new Date() : entry.submittedAt,
        updatedBy: actorId,
        version: { increment: 1 },
      },
    });
  }
}
