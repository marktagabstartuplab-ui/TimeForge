import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { NotificationsService } from '../../../api/src/modules/notifications/notifications.service';

const SWEEP_INTERVAL_MS = 30 * 60_000;
const SWEEP_JOB_ID = 'recurring-issue-sweep';

/** Lookback window for grouping blocker/delay occurrences into a recurring issue. */
const LOOKBACK_DAYS = 21;
/** A blocker/delay counts as "recurring" once it crosses either threshold. */
const MIN_OCCURRENCES = 3;
const MIN_DISTINCT_EMPLOYEES = 2;
/** A planned scrum task still open this many days after its entry date counts as delayed. */
const DELAY_AGE_DAYS = 2;

interface IssueGroup {
  tenantId: string;
  organizationId: string;
  departmentId: string | null;
  projectId: string | null;
  issueText: string;
  employeeIds: Set<string>;
  timestamps: Date[];
}

/**
 * Deterministic, rule-based detection of recurring operational issues across
 * Daily Scrum records — runs alongside (not instead of) the AI BLOCKER_DETECTION
 * toggle and the simple per-employee attachRecurringBlockerFlag() in
 * scrum.service.ts. Produces cross-employee/department/project RecurringIssue
 * records and notifies the affected employees' supervisors.
 */
@Processor('recurring-issue-detection')
export class RecurringIssueDetectionProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(RecurringIssueDetectionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue('recurring-issue-detection') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sweep',
      {},
      { jobId: SWEEP_JOB_ID, repeat: { every: SWEEP_INTERVAL_MS }, removeOnComplete: true, removeOnFail: true },
    );
  }

  async process(_job: Job): Promise<{ blockerGroups: number; delayGroups: number; created: number }> {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    let created = 0;

    const blockerGroups = await this.collectBlockerGroups(cutoff);
    const delayGroups = await this.collectDelayGroups(cutoff);

    for (const group of blockerGroups) {
      if (await this.upsertIfRecurring(group, 'BLOCKER')) created++;
    }
    for (const group of delayGroups) {
      if (await this.upsertIfRecurring(group, 'DELAY')) created++;
    }

    if (created > 0) {
      this.logger.log(`Recurring-issue sweep: ${created} new/escalated issue(s) detected.`);
    }
    return { blockerGroups: blockerGroups.length, delayGroups: delayGroups.length, created };
  }

  /** Same/similar blocker text — reported repeatedly by one employee, or by multiple employees. */
  private async collectBlockerGroups(cutoff: Date): Promise<IssueGroup[]> {
    const blockers = await this.prisma.scrumBlocker.findMany({
      where: { status: 'OPEN', createdAt: { gte: cutoff } },
      include: {
        scrumEntry: {
          select: {
            userId: true,
            projectId: true,
            user: { select: { departmentId: true } },
          },
        },
      },
    });

    const groups = new Map<string, IssueGroup>();
    for (const b of blockers) {
      if (!b.scrumEntry) continue;
      const issueText = b.title.trim().toLowerCase();
      if (!issueText) continue;
      const departmentId = b.scrumEntry.user?.departmentId ?? null;
      const projectId = b.scrumEntry.projectId ?? null;
      const key = `${b.tenantId}|${b.organizationId}|${departmentId}|${projectId}|${issueText}`;
      const group = groups.get(key) ?? {
        tenantId: b.tenantId,
        organizationId: b.organizationId,
        departmentId,
        projectId,
        issueText: b.title.trim(),
        employeeIds: new Set<string>(),
        timestamps: [],
      };
      group.employeeIds.add(b.scrumEntry.userId);
      group.timestamps.push(b.createdAt);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  /** Scrum tasks still open well past their planned entry date, grouped by project. */
  private async collectDelayGroups(cutoff: Date): Promise<IssueGroup[]> {
    const delayCutoff = new Date(Date.now() - DELAY_AGE_DAYS * 86_400_000);
    const tasks = await this.prisma.scrumTask.findMany({
      where: {
        deletedAt: null,
        taskStatus: { not: 'COMPLETED' },
        projectId: { not: null },
        createdAt: { gte: cutoff, lte: delayCutoff },
      },
      select: {
        tenantId: true,
        organizationId: true,
        projectId: true,
        employeeId: true,
        createdAt: true,
        project: { select: { departmentId: true } },
      },
    });

    const groups = new Map<string, IssueGroup>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      const departmentId = t.project?.departmentId ?? null;
      const key = `${t.tenantId}|${t.organizationId}|${departmentId}|${t.projectId}|delay`;
      const group = groups.get(key) ?? {
        tenantId: t.tenantId,
        organizationId: t.organizationId,
        departmentId,
        projectId: t.projectId,
        issueText: 'Repeated task delays on this project',
        employeeIds: new Set<string>(),
        timestamps: [],
      };
      group.employeeIds.add(t.employeeId);
      group.timestamps.push(t.createdAt);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  /** Persists a group as a RecurringIssue if it crosses threshold; notifies supervisors when newly created. */
  private async upsertIfRecurring(group: IssueGroup, category: 'BLOCKER' | 'DELAY'): Promise<boolean> {
    const occurrenceCount = group.timestamps.length;
    if (occurrenceCount < MIN_OCCURRENCES && group.employeeIds.size < MIN_DISTINCT_EMPLOYEES) return false;

    const sorted = [...group.timestamps].sort((a, b) => a.getTime() - b.getTime());
    const firstOccurrence = sorted[0];
    const lastOccurrence = sorted[sorted.length - 1];
    const trend = this.computeTrend(sorted);
    const employeeIds = [...group.employeeIds];
    const suggestedAction = this.suggestAction(category, group.issueText, group.employeeIds.size);

    const existing = await this.prisma.recurringIssue.findFirst({
      where: {
        tenantId: group.tenantId,
        organizationId: group.organizationId,
        category,
        departmentId: group.departmentId,
        projectId: group.projectId,
        issueText: group.issueText,
        status: 'OPEN',
      },
    });

    if (existing) {
      await this.prisma.recurringIssue.update({
        where: { id: existing.id },
        data: {
          employeeIds,
          occurrenceCount,
          lastOccurrence,
          trend,
          suggestedAction,
          version: { increment: 1 },
        },
      });
      return false; // already known — no re-notification
    }

    await this.prisma.recurringIssue.create({
      data: {
        tenantId: group.tenantId,
        organizationId: group.organizationId,
        category,
        issueText: group.issueText,
        departmentId: group.departmentId,
        projectId: group.projectId,
        employeeIds,
        occurrenceCount,
        firstOccurrence,
        lastOccurrence,
        trend,
        suggestedAction,
      },
    });

    await this.notifySupervisors(group);
    return true;
  }

  /** Compares occurrence density before/after the midpoint of the time span (not the array index). */
  private computeTrend(sorted: Date[]): 'INCREASING' | 'STABLE' | 'DECREASING' {
    if (sorted.length < 4) return 'STABLE';
    const midTime = (sorted[0].getTime() + sorted[sorted.length - 1].getTime()) / 2;
    const firstHalf = sorted.filter((d) => d.getTime() <= midTime).length;
    const secondHalf = sorted.length - firstHalf;
    if (secondHalf > firstHalf * 1.3) return 'INCREASING';
    if (firstHalf > secondHalf * 1.3) return 'DECREASING';
    return 'STABLE';
  }

  private suggestAction(category: 'BLOCKER' | 'DELAY', issueText: string, employeeCount: number): string {
    if (category === 'DELAY') {
      return 'Review project scope and resourcing — tasks are repeatedly slipping past their planned day.';
    }
    return employeeCount > 1
      ? `"${issueText}" has been reported by multiple team members — consider escalating to the project owner or removing the shared dependency.`
      : `"${issueText}" keeps recurring for the same employee — check in directly and consider reassigning or unblocking the dependency.`;
  }

  private async notifySupervisors(group: IssueGroup): Promise<void> {
    try {
      const employees = await this.prisma.user.findMany({
        where: { id: { in: [...group.employeeIds] }, deletedAt: null },
        select: { supervisorId: true },
      });
      const supervisorIds = [...new Set(employees.map((e) => e.supervisorId).filter((id): id is string => !!id))];

      await Promise.all(
        supervisorIds.map((supervisorId) =>
          this.notifications.create({
            tenantId: group.tenantId,
            organizationId: group.organizationId,
            userId: supervisorId,
            type: 'RECURRING_ISSUE_DETECTED',
            category: 'DAILY_SCRUM',
            title: 'Recurring operational issue detected',
            message: `"${group.issueText}" has recurred ${group.timestamps.length} time(s) across ${group.employeeIds.size} employee(s).`,
            actionUrl: '/time-tracking',
            actionLabel: 'View Daily Scrum',
          }),
        ),
      );
    } catch (err) {
      this.logger.error(`Supervisor notification fan-out failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
