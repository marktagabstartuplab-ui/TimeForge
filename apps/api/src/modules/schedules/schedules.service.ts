import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, Prisma, Shift, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateShiftDto, ScheduleCalendarQuery, ScheduleQuery, UpdateShiftDto } from './dto';

const MAX_SHIFT_HOURS = 16;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async teamUserIds(p: AuthPrincipal): Promise<string[]> {
    const reports = await this.prisma.user.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, supervisorId: p.userId, deletedAt: null },
      select: { id: true },
    });
    return [p.userId, ...reports.map((r) => r.id)];
  }

  /** Resolves the visible userId set for reads. undefined = no filter (org-wide). */
  private async resolveScopeUserIds(p: AuthPrincipal, requestedUserId?: string): Promise<string[] | undefined> {
    if (this.can(p, PERMISSIONS.SCHEDULE_READ_ORG)) {
      return requestedUserId ? [requestedUserId] : undefined;
    }
    if (this.can(p, PERMISSIONS.SCHEDULE_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (requestedUserId && !ids.includes(requestedUserId)) {
        throw new ForbiddenException('That employee is outside your team');
      }
      return requestedUserId ? [requestedUserId] : ids;
    }
    if (requestedUserId && requestedUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own schedule');
    }
    return [p.userId];
  }

  /** Supervisors may only manage their own team; HR/Admin (schedule:read_org) manage org-wide. */
  private async assertInManagementScope(p: AuthPrincipal, targetUserId: string): Promise<void> {
    if (this.can(p, PERMISSIONS.SCHEDULE_READ_ORG)) return;
    const ids = await this.teamUserIds(p);
    if (!ids.includes(targetUserId)) {
      throw new ForbiddenException('That employee is outside your team scope');
    }
  }

  private assertValidHours(startTime: Date, endTime: Date): void {
    if (endTime <= startTime) {
      throw new UnprocessableEntityException('endTime must be after startTime');
    }
    const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
    if (hours > MAX_SHIFT_HOURS) {
      throw new UnprocessableEntityException(`A single shift cannot exceed ${MAX_SHIFT_HOURS} hours`);
    }
  }

  private async assertNoOverlap(
    tenantId: string,
    organizationId: string,
    userId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId?: string,
  ): Promise<void> {
    const overlapping = await this.prisma.shift.findFirst({
      where: {
        tenantId,
        organizationId,
        userId,
        deletedAt: null,
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (overlapping) {
      throw new ConflictException('This shift overlaps with an existing shift for this employee');
    }
  }

  private async audit(p: AuthPrincipal, entityId: string, metadata: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'shift',
        entityId,
        metadata,
      },
    });
  }

  private async notifyEmployee(
    p: AuthPrincipal,
    shift: Shift,
    title: string,
    message: string,
  ): Promise<void> {
    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: shift.userId,
      senderId: p.userId,
      type: 'ANNOUNCEMENT',
      category: 'SCHEDULE',
      title,
      message,
      actionUrl: '/schedules',
      actionLabel: 'View Schedule',
    });
  }

  // ── GET /schedules ───────────────────────────────────────────────────────────

  async findAll(p: AuthPrincipal, query: ScheduleQuery): Promise<PageResult<Shift>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const userIds = await this.resolveScopeUserIds(p, query.userId);
    const where: Prisma.ShiftWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status ? { status: query.status as ShiftStatus } : {}),
      ...(query.from || query.to
        ? {
            shiftDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.shift.findMany({
      where,
      orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  // ── GET /schedules/calendar ──────────────────────────────────────────────────

  async getCalendar(p: AuthPrincipal, query: ScheduleCalendarQuery) {
    const userIds = await this.resolveScopeUserIds(p, query.userId);
    const weekStart = this.startOfWeek(query.weekStart ? new Date(query.weekStart) : new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const where: Prisma.ShiftWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      shiftDate: { gte: weekStart, lt: weekEnd },
    };

    const shifts = await this.prisma.shift.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true } }, department: { select: { name: true } } },
      orderBy: [{ userId: 'asc' }, { startTime: 'asc' }],
    });

    const conflictIds = await this.computeConflictIds(shifts);

    const byEmployee = new Map<
      string,
      { userId: string; name: string; department: string | null; shifts: unknown[] }
    >();
    for (const s of shifts) {
      if (!byEmployee.has(s.userId)) {
        byEmployee.set(s.userId, {
          userId: s.userId,
          name: `${s.user.firstName} ${s.user.lastName}`,
          department: s.department?.name ?? null,
          shifts: [],
        });
      }
      byEmployee.get(s.userId)!.shifts.push({
        id: s.id,
        shiftDate: s.shiftDate,
        startTime: s.startTime,
        endTime: s.endTime,
        shiftType: s.shiftType,
        status: s.status,
        notes: s.notes,
        conflict: conflictIds.has(s.id),
        version: s.version,
      });
    }

    const activeShifts = shifts.filter((s) => s.status === 'PUBLISHED').length;
    const openShifts = shifts.filter((s) => s.status === 'DRAFT').length;
    const scheduledMinutes = shifts.reduce((sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()) / 60_000, 0);

    const efficiency = await this.buildWeeklyEfficiency(p, userIds, weekStart, weekEnd, shifts);

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: new Date(weekEnd.getTime() - 1).toISOString(),
      summary: {
        activeShifts,
        openShifts,
        pendingRequests: openShifts,
        scheduledHours: +(scheduledMinutes / 60).toFixed(1),
      },
      employees: Array.from(byEmployee.values()),
      efficiency,
    };
  }

  /** Scheduled vs. actually-worked hours per day (real TimeEntry data) — the sidebar's Weekly Efficiency Chart. */
  private async buildWeeklyEfficiency(
    p: AuthPrincipal,
    userIds: string[] | undefined,
    weekStart: Date,
    weekEnd: Date,
    shifts: Shift[],
  ) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(userIds ? { userId: { in: userIds } } : {}),
        startTime: { gte: weekStart, lt: weekEnd },
      },
      select: { startTime: true, durationMinutes: true, endTime: true },
    });

    const days: { date: string; scheduledHours: number; workedHours: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setUTCDate(day.getUTCDate() + i);
      const dayKey = day.toISOString().slice(0, 10);
      const scheduledMinutes = shifts
        .filter((s) => s.shiftDate.toISOString().slice(0, 10) === dayKey)
        .reduce((sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()) / 60_000, 0);
      const workedMinutes = entries
        .filter((e) => e.startTime.toISOString().slice(0, 10) === dayKey)
        .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
      days.push({
        date: dayKey,
        scheduledHours: +(scheduledMinutes / 60).toFixed(1),
        workedHours: +(workedMinutes / 60).toFixed(1),
      });
    }
    return days;
  }

  // ── GET /schedules/conflicts ──────────────────────────────────────────────────

  async getConflicts(p: AuthPrincipal, query: ScheduleQuery) {
    const userIds = await this.resolveScopeUserIds(p, query.userId);
    const where: Prisma.ShiftWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(query.from || query.to
        ? {
            shiftDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const shifts = await this.prisma.shift.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ userId: 'asc' }, { startTime: 'asc' }],
    });

    const conflicts: {
      shiftAId: string;
      shiftBId: string;
      userId: string;
      employeeName: string;
      overlapStart: string;
      overlapEnd: string;
    }[] = [];

    for (let i = 0; i < shifts.length; i++) {
      for (let j = i + 1; j < shifts.length; j++) {
        const a = shifts[i];
        const b = shifts[j];
        if (a.userId !== b.userId) continue;
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          conflicts.push({
            shiftAId: a.id,
            shiftBId: b.id,
            userId: a.userId,
            employeeName: `${a.user.firstName} ${a.user.lastName}`,
            overlapStart: (a.startTime > b.startTime ? a.startTime : b.startTime).toISOString(),
            overlapEnd: (a.endTime < b.endTime ? a.endTime : b.endTime).toISOString(),
          });
        }
      }
    }
    return conflicts;
  }

  private async computeConflictIds(shifts: (Shift & { user?: unknown })[]): Promise<Set<string>> {
    const ids = new Set<string>();
    const byUser = new Map<string, Shift[]>();
    for (const s of shifts) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, []);
      byUser.get(s.userId)!.push(s);
    }
    for (const list of byUser.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].startTime < list[j].endTime && list[j].startTime < list[i].endTime) {
            ids.add(list[i].id);
            ids.add(list[j].id);
          }
        }
      }
    }
    return ids;
  }

  // ── GET /schedules/requests ───────────────────────────────────────────────────

  /** DRAFT shifts awaiting supervisor publish — the sidebar's Pending Requests. */
  async getRequests(p: AuthPrincipal, query: ScheduleQuery): Promise<PageResult<Shift>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const userIds = await this.resolveScopeUserIds(p, query.userId);
    const where: Prisma.ShiftWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      status: 'DRAFT',
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.shift.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } },
      orderBy: [{ shiftDate: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items as unknown as Shift[], limit);
  }

  // ── POST /schedules ───────────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateShiftDto): Promise<Shift> {
    await this.assertInManagementScope(p, dto.userId);

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.assertValidHours(startTime, endTime);
    await this.assertNoOverlap(p.tenantId, p.organizationId, dto.userId, startTime, endTime);

    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      });
      if (!dept) throw new NotFoundException('Department not found');
    }

    const publish = dto.publish === 'true';
    const shift = await this.prisma.shift.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: dto.userId,
        departmentId: dto.departmentId,
        shiftDate: new Date(dto.shiftDate),
        startTime,
        endTime,
        shiftType: dto.shiftType,
        status: publish ? 'PUBLISHED' : 'DRAFT',
        notes: dto.notes,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });

    await this.audit(p, shift.id, { event: publish ? 'SHIFT_PUBLISHED' : 'SHIFT_DRAFTED', userId: dto.userId });
    if (publish) {
      await this.notifyEmployee(p, shift, 'New shift scheduled', 'A new shift has been added to your schedule.');
    }
    return shift;
  }

  // ── POST /schedules/draft ─────────────────────────────────────────────────────

  /** Always saves as DRAFT, regardless of the `publish` field on the payload. */
  async createDraft(p: AuthPrincipal, dto: CreateShiftDto): Promise<Shift> {
    return this.create(p, { ...dto, publish: 'false' });
  }

  // ── PATCH /schedules/:id ──────────────────────────────────────────────────────

  async update(p: AuthPrincipal, id: string, dto: UpdateShiftDto): Promise<Shift> {
    const shift = await this.prisma.shift.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    await this.assertInManagementScope(p, shift.userId);
    if (shift.version !== dto.version) throw new ConflictException('Version mismatch — please refresh and retry');

    const startTime = dto.startTime ? new Date(dto.startTime) : shift.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : shift.endTime;
    if (dto.startTime || dto.endTime) {
      this.assertValidHours(startTime, endTime);
      await this.assertNoOverlap(p.tenantId, p.organizationId, shift.userId, startTime, endTime, id);
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      });
      if (!dept) throw new NotFoundException('Department not found');
    }

    const wasPublished = shift.status === 'PUBLISHED';
    const nextStatus = dto.status ?? shift.status;

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        departmentId: dto.departmentId ?? shift.departmentId,
        shiftDate: dto.shiftDate ? new Date(dto.shiftDate) : shift.shiftDate,
        startTime,
        endTime,
        shiftType: dto.shiftType ?? shift.shiftType,
        status: nextStatus,
        notes: dto.notes ?? shift.notes,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.audit(p, id, { event: 'SHIFT_UPDATED', changes: { ...dto } });
    if (!wasPublished && updated.status === 'PUBLISHED') {
      await this.notifyEmployee(p, updated, 'Shift published', 'Your draft shift has been published to your schedule.');
    } else if (wasPublished && (dto.startTime || dto.endTime || dto.shiftDate)) {
      await this.notifyEmployee(p, updated, 'Shift updated', 'One of your scheduled shifts has been changed.');
    }
    return updated;
  }

  // ── DELETE /schedules/:id ─────────────────────────────────────────────────────

  async remove(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const shift = await this.prisma.shift.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    await this.assertInManagementScope(p, shift.userId);
    if (shift.version !== version) throw new ConflictException('Version mismatch — please refresh and retry');

    await this.prisma.shift.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId, version: { increment: 1 } },
    });
    await this.audit(p, id, { event: 'SHIFT_DELETED' });
    if (shift.status === 'PUBLISHED') {
      await this.notifyEmployee(p, shift, 'Shift cancelled', 'A shift on your schedule has been cancelled.');
    }
  }

  private startOfWeek(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // ISO week starts Monday
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }
}
