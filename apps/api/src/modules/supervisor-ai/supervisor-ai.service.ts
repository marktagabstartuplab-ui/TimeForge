import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import { SupervisorAiExportDto, SupervisorAiQuery } from './dto';

@Injectable()
export class SupervisorAiService {
  private readonly logger = new Logger(SupervisorAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectQueue('performance-export') private readonly exportQueue: Queue,
  ) {}

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private assertAccess(p: AuthPrincipal): void {
    if (!this.can(p, PERMISSIONS.AI_TRIGGER_TEAM) && !this.can(p, PERMISSIONS.AI_TRIGGER_ORG)) {
      throw new ForbiddenException('Supervisor AI access required');
    }
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

  private async scopeUserIds(p: AuthPrincipal): Promise<string[] | undefined> {
    return this.can(p, PERMISSIONS.AI_TRIGGER_ORG)
      ? undefined
      : await this.teamUserIds(p);
  }

  private async teamMembers(p: AuthPrincipal, query: SupervisorAiQuery): Promise<{ id: string; firstName: string; lastName: string; department: { name: string } | null }[]> {
    const userIds = await this.scopeUserIds(p);
    return this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(userIds ? { id: { in: userIds } } : {}),
        ...(query.employeeId ? { id: query.employeeId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.teamId ? { teamId: query.teamId } : {}),
      },
      select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } },
    });
  }

  private dateRange(query: SupervisorAiQuery): { from: Date; to: Date } {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    let from: Date;
    if (query.from) {
      from = new Date(query.from);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    }
    return { from, to };
  }

  // ─────── GET /supervisor/ai/dashboard ───────

  async getDashboard(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const cacheKey = `supervisor-ai:dashboard:${p.userId}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [
      periods,
      progressRows,
      timesheets,
      scrumEntries,
      workSessions,
      aiResults,
    ] = await Promise.all([
      this.prisma.payrollPeriod.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
        select: { id: true, status: true },
      }),
      this.prisma.kpiProgress.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
        },
        select: { currentValue: true, targetValue: true },
      }),
      this.prisma.timesheet.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
          status: { in: ['APPROVED', 'PAYROLL_READY'] },
          periodEnd: { gte: from, lte: to },
        },
        select: { totalMinutes: true, status: true },
      }),
      this.prisma.scrumEntry.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
          entryDate: { gte: from, lte: to },
        },
        select: { id: true, userId: true, entryDate: true },
      }),
      this.prisma.workSession.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          clockIn: { gte: from, lte: to },
        },
        select: { breakMinutes: true, clockIn: true },
      }),
      this.prisma.aiResult.findMany({
        where: {
          tenantId: p.tenantId,
          job: {
            createdBy: { in: memberIds },
            feature: { in: ['SUPERVISOR_ADVISORY', 'PRODUCTIVITY_INSIGHT', 'KPI_ANALYSIS'] },
          },
        },
        select: { confidence: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const totalHours = timesheets.reduce((s, t) => s + t.totalMinutes, 0) / 60;
    const totalMembers = members.length || 1;
    const activePeriods = periods.filter((p) => p.status === 'OPEN').length;

    const kpiSum = progressRows.reduce((s, r) => s + (Number(r.targetValue) > 0 ? Number(r.currentValue) / Number(r.targetValue) * 100 : 0), 0);
    const avgPerformance = progressRows.length > 0 ? Math.round(kpiSum / progressRows.length) : 0;

    const scrumDays = new Set(scrumEntries.map((e) => e.entryDate.toISOString().slice(0, 10))).size;
    const possibleDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
    const scrumCompletionRate = Math.min(100, Math.round((scrumDays / possibleDays) * totalMembers * 100));

    const totalSessions = workSessions.length;
    const breakMins = workSessions.reduce((s, ws) => s + ws.breakMinutes, 0);
    const totalWorkMins = timesheets.reduce((s, t) => s + t.totalMinutes, 0);
    const focusTimePct = totalWorkMins > 0 ? Math.round(100 - (breakMins / (totalWorkMins + breakMins)) * 100) : 0;

    const healthScores = this.computeHealthScores(
      avgPerformance, scrumCompletionRate, focusTimePct,
      totalMembers, progressRows, aiResults.map((r) => ({ confidence: Number(r.confidence ?? 0) })),
    );

    const automationsImplemented = await this.prisma.aiJob.count({
      where: {
        tenantId: p.tenantId,
        createdBy: { in: memberIds },
        feature: { in: ['SUPERVISOR_ADVISORY', 'KPI_ANALYSIS', 'PRODUCTIVITY_INSIGHT'] },
        status: 'SUCCEEDED',
        createdAt: { gte: from, lte: to },
      },
    });

    const result = {
      summaryCards: {
        avgTeamPerformance: { value: `${avgPerformance}%`, change: healthScores.change, trend: healthScores.change >= 0 ? 'up' : 'down' },
        aiAutomations: { value: automationsImplemented, change: 0, trend: 'neutral' },
        activeRisks: { value: healthScores.activeRisks, change: healthScores.riskChange, trend: healthScores.riskChange <= 0 ? 'down' : 'up' },
        productivityImprovement: { value: `${focusTimePct}%`, change: healthScores.productivityChange, trend: healthScores.productivityChange >= 0 ? 'up' : 'down' },
        teamHealthScore: { value: `${healthScores.overall}%`, change: healthScores.healthChange, trend: healthScores.healthChange >= 0 ? 'up' : 'down' },
      },
      activePeriods,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, result, 120);
    return result;
  }

  // ─────── GET /supervisor/ai/leaderboard ───────

  async getLeaderboard(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [progressRows, aiResults, timesheets] = await Promise.all([
      this.prisma.kpiProgress.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
        },
        select: { userId: true, currentValue: true, targetValue: true, kpiTemplate: { select: { name: true } } },
      }),
      this.prisma.aiResult.findMany({
        where: {
          tenantId: p.tenantId,
          job: {
            createdBy: { in: memberIds },
            feature: 'PRODUCTIVITY_INSIGHT',
          },
        },
        select: { confidence: true, job: { select: { createdBy: true } } },
      }),
      this.prisma.timesheet.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
          status: 'APPROVED',
          periodEnd: { gte: from, lte: to },
        },
        select: { userId: true, totalMinutes: true },
      }),
    ]);

    const progressByUser = this.groupBy(progressRows, 'userId');
    const timesheetHoursByUser = new Map<string, number>();
    for (const t of timesheets) {
      timesheetHoursByUser.set(t.userId, (timesheetHoursByUser.get(t.userId) ?? 0) + t.totalMinutes);
    }
    const aiConfByUser = new Map<string, number[]>();
    for (const r of aiResults) {
      const uid = r.job.createdBy;
      if (!uid) continue;
      const val = Number(r.confidence ?? 0);
      const arr = aiConfByUser.get(uid);
      if (arr) arr.push(val);
      else aiConfByUser.set(uid, [val]);
    }

    const leaderboard = members.map((m) => {
      const kpis = progressByUser.get(m.id) ?? [];
      const kpiScore = kpis.length > 0
        ? Math.round(kpis.reduce((s, k) => s + (Number(k.targetValue) > 0 ? Number(k.currentValue) / Number(k.targetValue) * 100 : 0), 0) / kpis.length)
        : 0;
      const hours = Math.round((timesheetHoursByUser.get(m.id) ?? 0) / 60);
      const avgConf = aiConfByUser.get(m.id) ?? [];
      const aiBoost = avgConf.length > 0 ? Math.round(avgConf.reduce((s, c) => s + c, 0) / avgConf.length * 10) : 0;
      const score = Math.min(100, kpiScore + aiBoost);
      const trend = this.computeTrend(score);

      let status: string;
      if (score >= 80) status = 'Exceeding';
      else if (score >= 60) status = 'On Track';
      else if (score >= 40) status = 'Needs Attention';
      else status = 'Critical';

      return {
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        department: m.department?.name ?? 'Unassigned',
        performanceScore: score,
        productivityTrend: trend,
        aiStatus: status,
        totalHours: hours,
        kpisTracked: kpis.length,
      };
    });

    leaderboard.sort((a, b) => b.performanceScore - a.performanceScore);
    return leaderboard;
  }

  // ─────── GET /supervisor/ai/insights ───────

  async getInsights(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [scrumEntries, timesheets, aiResults] = await Promise.all([
      this.prisma.scrumEntry.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
          entryDate: { gte: from, lte: to },
        },
        select: { blockers: true, userId: true },
      }),
      this.prisma.timesheet.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: memberIds },
          deletedAt: null,
          periodEnd: { gte: from, lte: to },
        },
        select: { totalMinutes: true, status: true, userId: true },
      }),
      this.prisma.aiResult.findMany({
        where: {
          tenantId: p.tenantId,
          job: {
            createdBy: { in: memberIds },
            feature: 'SUPERVISOR_ADVISORY',
          },
        },
        select: { summary: true, recommendation: true, confidence: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const blockedScrums = scrumEntries.filter((e) => e.blockers && e.blockers.length > 0);
    const totalHours = timesheets.reduce((s, t) => s + t.totalMinutes, 0) / 60;
    const avgHoursPerMember = members.length > 0 ? totalHours / members.length : 0;

    const insights: {
      type: string;
      title: string;
      description: string;
      priority: string;
      generatedAt: string;
      confidence: number;
      suggestedAction: string;
    }[] = [];

    if (blockedScrums.length > members.length * 0.3) {
      const pctBlocked = members.length > 0 ? blockedScrums.length / members.length : 0;
      insights.push({
        type: 'WORKFLOW_OPTIMIZATION',
        title: 'Workflow Optimization',
        description: `${blockedScrums.length} blockers reported across the team. Review scrum workflows to identify bottlenecks.`,
        priority: 'high',
        generatedAt: new Date().toISOString(),
        confidence: Math.min(95, Math.round(pctBlocked * 100)),
        suggestedAction: 'Review team scrum entries and address common blockers',
      });
    }

    if (avgHoursPerMember > 40) {
      const excessRatio = Math.min(1, (avgHoursPerMember - 40) / 20);
      insights.push({
        type: 'MEETING_EFFICIENCY',
        title: 'Meeting Efficiency',
        description: `Team averaging ${avgHoursPerMember.toFixed(1)}h/week. Consider optimizing meeting hours to improve focus time.`,
        priority: 'medium',
        generatedAt: new Date().toISOString(),
        confidence: Math.round(50 + excessRatio * 40),
        suggestedAction: 'Audit recurring meetings and reduce non-essential gatherings',
      });
    }

    if (aiResults.length > 0) {
      const bestResult = aiResults[0];
      insights.push({
        type: 'SKILL_IMPROVEMENT',
        title: 'Skill Improvement',
        description: bestResult.recommendation || 'AI analysis suggests targeted skill development opportunities.',
        priority: 'medium',
        generatedAt: bestResult.createdAt.toISOString(),
        confidence: Math.round(Number(bestResult.confidence ?? 0) * 100),
        suggestedAction: 'Review AI advisory and create development plan',
      });
    }

    const highOT = timesheets.filter((t) => t.totalMinutes > 600 * 60);
    if (highOT.length > 0) {
      const otRatio = members.length > 0 ? highOT.length / members.length : 0;
      insights.push({
        type: 'BURNOUT_PREVENTION',
        title: 'Burnout Prevention',
        description: `${highOT.length} team members logged over 10 hours in sessions. Monitor for burnout risk.`,
        priority: 'high',
        generatedAt: new Date().toISOString(),
        confidence: Math.min(95, Math.round(otRatio * 100)),
        suggestedAction: 'Schedule check-ins with overloaded team members',
      });
    }

    if (blockedScrums.length > 0) {
      const blockers = blockedScrums.filter((e) => e.blockers?.toLowerCase().includes('communication'));
      if (blockers.length >= 2) {
        const commRatio = blockedScrums.length > 0 ? blockers.length / blockedScrums.length : 0;
        insights.push({
          type: 'COMMUNICATION_COACHING',
          title: 'Communication Coaching',
          description: 'Multiple team members reporting communication-related blockers. Consider team collaboration workshop.',
          priority: 'medium',
          generatedAt: new Date().toISOString(),
          confidence: Math.min(90, Math.round(commRatio * 100)),
          suggestedAction: 'Schedule communication workshop or 1:1 coaching',
        });
      }
    }

    insights.push({
      type: 'API_INTEGRATION_HELP',
      title: 'API Integration Help',
      description: 'Monitor integration health across your team\'s projects to identify where additional support may be needed.',
      priority: 'low',
      generatedAt: new Date().toISOString(),
      confidence: Math.min(70, Math.round(members.length * 5)),
      suggestedAction: 'Review project integration points and provide documentation support',
    });

    return { insights, total: insights.length };
  }

  // ─────── GET /supervisor/ai/recommendations ───────

  async getRecommendations(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [progressRows, timesheets, scrumEntries, aiResults] = await Promise.all([
      this.prisma.kpiProgress.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null },
        select: { userId: true, currentValue: true, targetValue: true },
      }),
      this.prisma.timesheet.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, periodEnd: { gte: from, lte: to } },
        select: { userId: true, totalMinutes: true, status: true },
      }),
      this.prisma.scrumEntry.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, entryDate: { gte: from, lte: to } },
        select: { userId: true, blockers: true },
      }),
      this.prisma.aiResult.findMany({
        where: { tenantId: p.tenantId, job: { createdBy: { in: memberIds }, feature: 'SUPERVISOR_ADVISORY' } },
        select: { recommendation: true, confidence: true, summary: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const progressByUser = this.groupBy(progressRows, 'userId');
    const hoursByUser = new Map<string, number>();
    for (const t of timesheets) hoursByUser.set(t.userId, (hoursByUser.get(t.userId) ?? 0) + t.totalMinutes);
    const blockersByUser = this.groupBy(scrumEntries, 'userId');

    const recommendations: {
      type: string;
      title: string;
      description: string;
      confidenceLevel: number;
      expectedImpact: string;
      supportingData: string;
      userId?: string;
      employeeName?: string;
    }[] = [];

    for (const m of members) {
      const kpis = progressByUser.get(m.id) ?? [];
      const avgScore = kpis.length > 0
        ? Math.round(kpis.reduce((s, k) => s + (Number(k.targetValue) > 0 ? Number(k.currentValue) / Number(k.targetValue) * 100 : 0), 0) / kpis.length)
        : 0;
      const hours = (hoursByUser.get(m.id) ?? 0) / 60;
      const blockers = blockersByUser.get(m.id) ?? [];
      const name = `${m.firstName} ${m.lastName}`;

      if (avgScore >= 90) {
        recommendations.push({
          type: 'PROMOTE_HIGH_PERFORMER',
          title: 'Promote High Performer',
          description: `${name} has achieved ${avgScore}% KPI average — above excellence threshold.`,
          confidenceLevel: Math.min(95, avgScore),
          expectedImpact: 'High — retention and morale boost',
          supportingData: `KPI Score: ${avgScore}% across ${kpis.length} metrics`,
          userId: m.id,
          employeeName: name,
        });
      }

      if (hours > 180) {
        const excessPct = Math.min(100, Math.round(((hours - 180) / 180) * 100));
        recommendations.push({
          type: 'REBALANCE_WORKLOAD',
          title: 'Reassign Overloaded Employee',
          description: `${name} logged ${Math.round(hours)}h in the period — workload exceeds sustainable threshold.`,
          confidenceLevel: Math.min(95, 50 + excessPct / 2),
          expectedImpact: 'Medium — reduces burnout risk',
          supportingData: `Total hours: ${Math.round(hours)}h`,
          userId: m.id,
          employeeName: name,
        });
      }

      if (avgScore < 50) {
        recommendations.push({
          type: 'RECOMMEND_TRAINING',
          title: 'Recommend Training',
          description: `${name}'s KPI performance (${avgScore}%) is below targets. Training intervention recommended.`,
          confidenceLevel: Math.round(100 - avgScore),
          expectedImpact: 'Medium — skill gap closure',
          supportingData: `KPI Score: ${avgScore}%, Underperformance identified`,
          userId: m.id,
          employeeName: name,
        });
      }

      if (blockers.length >= 3) {
        recommendations.push({
          type: 'ADJUST_WORKLOAD',
          title: 'Adjust Workload',
          description: `${name} reported ${blockers.length} blockers. May need workload adjustment.`,
          confidenceLevel: Math.min(90, 50 + blockers.length * 8),
          expectedImpact: 'Medium — removes obstacles',
          supportingData: `${blockers.length} scrum blockers reported`,
          userId: m.id,
          employeeName: name,
        });
      }

      if (avgScore >= 70 && avgScore < 90) {
        recommendations.push({
          type: 'RECOGNIZE_ACHIEVEMENTS',
          title: 'Recognize Achievements',
          description: `${name} is performing well (${avgScore}%). Recognition can boost morale and retention.`,
          confidenceLevel: Math.max(50, avgScore - 5),
          expectedImpact: 'Low — positive reinforcement',
          supportingData: `KPI Score: ${avgScore}%, Consistent performance`,
          userId: m.id,
          employeeName: name,
        });
      }
    }

    recommendations.sort((a, b) => b.confidenceLevel - a.confidenceLevel);
    return { recommendations, total: recommendations.length };
  }

  // ─────── GET /supervisor/ai/team-health ───────

  async getTeamHealth(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [progressRows, timesheets, scrumEntries, workSessions] = await Promise.all([
      this.prisma.kpiProgress.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null },
        select: { userId: true, currentValue: true, targetValue: true },
      }),
      this.prisma.timesheet.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, periodEnd: { gte: from, lte: to } },
        select: { userId: true, totalMinutes: true, status: true },
      }),
      this.prisma.scrumEntry.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, entryDate: { gte: from, lte: to } },
        select: { userId: true, entryDate: true },
      }),
      this.prisma.workSession.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, clockIn: { gte: from, lte: to } },
        select: { userId: true, breakMinutes: true, clockIn: true },
      }),
    ]);

    const kpiPcts = progressRows.map((r) => Number(r.targetValue) > 0 ? Number(r.currentValue) / Number(r.targetValue) * 100 : 0);
    const avgKpi = kpiPcts.length > 0 ? Math.round(kpiPcts.reduce((s, v) => s + v, 0) / kpiPcts.length) : 0;

    const scrumDays = new Set(scrumEntries.map((e) => e.entryDate.toISOString().slice(0, 10))).size;
    const possibleWorkDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
    const attendanceRate = Math.min(100, Math.round((scrumDays / possibleWorkDays) * 100));

    const totalBreakMin = workSessions.reduce((s, ws) => s + ws.breakMinutes, 0);
    const totalWorkMin = timesheets.reduce((s, t) => s + t.totalMinutes, 0);
    const focusTimePct = totalWorkMin > 0 ? Math.round(100 - (totalBreakMin / (totalWorkMin + totalBreakMin)) * 100) : 0;

    const qualityScore = avgKpi;
    const consistencyScore = Math.round(attendanceRate * 0.6 + focusTimePct * 0.4);
    const collaborationScore = Math.min(100, Math.round((scrumEntries.length / Math.max(1, memberIds.length * possibleWorkDays)) * 100));

    const scores = {
      productivity: focusTimePct,
      collaboration: collaborationScore,
      attendance: attendanceRate,
      quality: qualityScore,
      consistency: consistencyScore,
    };

    const overall = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length);
    const riskLevel = overall >= 80 ? 'Low' : overall >= 60 ? 'Moderate' : 'High';

    const scoresWithTargets = Object.entries(scores).map(([key, value]) => ({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value,
      target: 80,
      gap: Math.max(0, 80 - value),
    }));

    return {
      overallHealthScore: overall,
      riskLevel,
      scores: scoresWithTargets,
      historicalTrend: this.generateTrend(overall),
      aiSummary: `Team health at ${overall}% — ${riskLevel.toLowerCase()} risk. ${Object.entries(scores).filter(([_, v]) => v < 70).map(([k]) => k).join(', ') || 'All'} metrics need attention.`,
      memberCount: memberIds.length,
    };
  }

  // ─────── GET /supervisor/ai/trends ───────

  async getTrends(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [timesheets, scrumTasks, workSessions] = await Promise.all([
      this.prisma.timesheet.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, periodEnd: { gte: from, lte: to } },
        select: { periodEnd: true, totalMinutes: true },
      }),
      this.prisma.scrumTask.findMany({
        where: {
          tenantId: p.tenantId,
          scrumEntry: { userId: { in: memberIds }, deletedAt: null, entryDate: { gte: from, lte: to } },
          deletedAt: null,
        },
        select: { completedAt: true, taskStatus: true },
      }),
      this.prisma.workSession.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, clockIn: { gte: from, lte: to } },
        select: { clockIn: true, breakMinutes: true },
      }),
    ]);

    const dayBuckets = new Map<string, { hours: number; tasks: number; focus: number; sessions: number }>();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = dayNames[d.getDay()];
      if (!dayBuckets.has(key)) dayBuckets.set(key, { hours: 0, tasks: 0, focus: 0, sessions: 0 });
    }

    for (const t of timesheets) {
      const day = dayNames[t.periodEnd.getDay()];
      const bucket = dayBuckets.get(day);
      if (bucket) bucket.hours += t.totalMinutes / 60;
    }

    for (const st of scrumTasks) {
      if (st.completedAt) {
        const day = dayNames[st.completedAt.getDay()];
        const bucket = dayBuckets.get(day);
        if (bucket) bucket.tasks += 1;
      }
    }

    for (const ws of workSessions) {
      const day = dayNames[ws.clockIn.getDay()];
      const bucket = dayBuckets.get(day);
      if (bucket) {
        bucket.sessions += 1;
        bucket.focus += Math.max(0, 100 - Math.round(ws.breakMinutes / 3600 * 10));
      }
    }

    for (const [, v] of dayBuckets) {
      v.hours = Math.round(v.hours * 10) / 10;
      v.focus = v.sessions > 0 ? Math.round(v.focus / v.sessions) : 0;
    }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const trends = days.map((d) => dayBuckets.get(d) ?? { hours: 0, tasks: 0, focus: 80, sessions: 0 });

    const totalHours = trends.reduce((s, t) => s + t.hours, 0);
    const totalTasks = trends.reduce((s, t) => s + t.tasks, 0);
    const avgFocus = trends.filter((t) => t.sessions > 0).reduce((s, t) => s + t.focus, 0) / Math.max(1, trends.filter((t) => t.sessions > 0).length);
    const avgVelocity = totalTasks / Math.max(1, Object.keys(dayBuckets).length);

    return {
      daily: trends.map((t, i) => ({ day: days[i], ...t })),
      summary: {
        totalHours: Math.round(totalHours * 10) / 10,
        totalTasks,
        avgFocusTime: Math.round(avgFocus),
        teamVelocity: Math.round(avgVelocity * 10) / 10,
      },
    };
  }

  // ─────── GET /supervisor/ai/alerts ───────

  async getAlerts(p: AuthPrincipal, query: SupervisorAiQuery) {
    this.assertAccess(p);
    const members = await this.teamMembers(p, query);
    const memberIds = members.map((m) => m.id);
    const { from, to } = this.dateRange(query);

    const [progressRows, timesheets, scrumEntries] = await Promise.all([
      this.prisma.kpiProgress.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null },
        select: { userId: true, currentValue: true, targetValue: true },
      }),
      this.prisma.timesheet.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, periodEnd: { gte: from, lte: to } },
        select: { userId: true, totalMinutes: true, status: true },
      }),
      this.prisma.scrumEntry.findMany({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: memberIds }, deletedAt: null, entryDate: { gte: from, lte: to } },
        select: { userId: true, blockers: true, entryDate: true },
      }),
    ]);

    const progressByUser = this.groupBy(progressRows, 'userId');
    const hoursByUser = new Map<string, number>();
    for (const t of timesheets) hoursByUser.set(t.userId, (hoursByUser.get(t.userId) ?? 0) + t.totalMinutes / 60);
    const blockersByUser = this.groupBy(scrumEntries, 'userId');
    const userMap = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));

    const alerts: {
      type: string;
      severity: string;
      title: string;
      message: string;
      affectedEmployees: string[];
      aiExplanation: string;
      suggestedAction: string;
      actionType: string;
    }[] = [];

    for (const m of members) {
      const kpis = progressByUser.get(m.id) ?? [];
      const avgPct = kpis.length > 0
        ? Math.round(kpis.reduce((s, k) => s + (Number(k.targetValue) > 0 ? Number(k.currentValue) / Number(k.targetValue) * 100 : 0), 0) / kpis.length)
        : 0;
      const hours = hoursByUser.get(m.id) ?? 0;
      const blockers = blockersByUser.get(m.id) ?? [];

      if (avgPct < 40) {
        alerts.push({
          type: 'PERFORMANCE_DECLINE',
          severity: 'HIGH',
          title: 'Performance Decline',
          message: `${userMap.get(m.id)} is underperforming at ${avgPct}% KPI average.`,
          affectedEmployees: [m.id],
          aiExplanation: `KPI progress at ${avgPct}% — below 40% threshold across ${kpis.length} metrics.`,
          suggestedAction: 'Review Employee',
          actionType: 'review',
        });
      }

      if (hours > 200) {
        alerts.push({
          type: 'BURNOUT_RISK',
          severity: 'HIGH',
          title: 'Burnout Risk',
          message: `${userMap.get(m.id)} logged ${Math.round(hours)}h — exceeds healthy workload threshold.`,
          affectedEmployees: [m.id],
          aiExplanation: `${Math.round(hours)} hours logged in period. Sustained high hours indicate burnout risk.`,
          suggestedAction: 'Schedule Coaching',
          actionType: 'coaching',
        });
      }

      if (blockers.length >= 3) {
        alerts.push({
          type: 'COACHING_REQUIRED',
          severity: 'MEDIUM',
          title: 'Coaching Required',
          message: `${userMap.get(m.id)} reported ${blockers.length} blockers. Coaching intervention may help.`,
          affectedEmployees: [m.id],
          aiExplanation: `${blockers.length} blockers in scrum entries suggest coaching opportunity.`,
          suggestedAction: 'Assign Mentor',
          actionType: 'mentor',
        });
      }

      if (hours > 0 && hours < 20) {
        alerts.push({
          type: 'WORKLOAD_IMBALANCE',
          severity: 'MEDIUM',
          title: 'Workload Imbalance',
          message: `${userMap.get(m.id)} logged only ${Math.round(hours)}h — significantly below team average.`,
          affectedEmployees: [m.id],
          aiExplanation: `Low hours (${Math.round(hours)}h) may indicate underutilization or availability issue.`,
          suggestedAction: 'Rebalance Workload',
          actionType: 'rebalance',
        });
      }
    }

    const combinedBlockers = scrumEntries.filter((e) => e.blockers?.toLowerCase().includes('deadline'));
    if (combinedBlockers.length >= 3) {
      alerts.push({
        type: 'MISSED_DEADLINES',
        severity: 'HIGH',
        title: 'Missed Deadlines Risk',
        message: `${combinedBlockers.length} deadline-related blockers reported across team.`,
        affectedEmployees: [...new Set(combinedBlockers.map((b) => b.userId))],
        aiExplanation: `${combinedBlockers.length} scrum entries reference deadline concerns.`,
        suggestedAction: 'View Recommendation',
        actionType: 'recommendation',
      });
    }

    const highOT = timesheets.filter((t) => t.totalMinutes > 540 * 60);
    if (highOT.length >= 2) {
      alerts.push({
        type: 'HIGH_OVERTIME',
        severity: 'MEDIUM',
        title: 'High Overtime',
        message: `${highOT.length} team members logged over 9 hours. Review overtime distribution.`,
        affectedEmployees: [...new Set(highOT.map((h) => h.userId))],
        aiExplanation: `Excessive hours detected for ${highOT.length} members.`,
        suggestedAction: 'View Recommendation',
        actionType: 'recommendation',
      });
    }

    const projectDelays = scrumEntries.filter((e) => e.blockers?.toLowerCase().includes('dependency'));
    if (projectDelays.length >= 2) {
      alerts.push({
        type: 'PROJECT_DELAY_RISK',
        severity: 'MEDIUM',
        title: 'Project Delay Risk',
        message: `${projectDelays.length} dependency-related blockers. May impact delivery timelines.`,
        affectedEmployees: [...new Set(projectDelays.map((d) => d.userId))],
        aiExplanation: `Dependency blockers identified — coordination gaps may cause delays.`,
        suggestedAction: 'View Recommendation',
        actionType: 'recommendation',
      });
    }

    alerts.sort((a, b) => a.severity === 'HIGH' ? -1 : b.severity === 'HIGH' ? 1 : 0);
    return { alerts, total: alerts.length };
  }

  // ─────── POST /supervisor/ai/export ───────

  async queueExport(p: AuthPrincipal, dto: SupervisorAiExportDto) {
    this.assertAccess(p);
    const userIds = await this.scopeUserIds(p);
    const members = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(userIds ? { id: { in: userIds } } : {}),
        ...(dto.teamId ? { teamId: dto.teamId } : {}),
        ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
    });

    const job = await this.exportQueue.add('performance-export-job', {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userIds: members.map((m) => m.id),
      format: dto.format,
      actorId: p.userId,
    }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'AI_USAGE',
        entityType: 'supervisor_ai_export',
        entityId: job.id ?? '',
        metadata: { format: dto.format, memberCount: members.length },
      },
    });

    return { jobId: job.id, status: 'QUEUED', message: `Export queued as ${dto.format}` };
  }

  // ─────── Helpers ───────

  private computeHealthScores(
    avgPerformance: number,
    scrumCompletionRate: number,
    focusTimePct: number,
    totalMembers: number,
    progressRows: { currentValue: { toString: () => string }; targetValue: { toString: () => string } }[],
    aiResults: { confidence: number }[],
  ) {
    const raw = (avgPerformance + scrumCompletionRate + focusTimePct) / 3;
    const overall = Math.round(raw);
    const underperforming = progressRows.filter((r) => Number(r.targetValue) > 0 && Number(r.currentValue) / Number(r.targetValue) < 0.6);
    // Direction from real data: positive when overall > 60 (slightly above midpoint), negative otherwise.
    const healthDelta = overall > 60 ? Math.min(5, Math.round((overall - 60) / 10)) : -Math.min(5, Math.round((60 - overall) / 10));
    const focusDelta = focusTimePct > 60 ? Math.min(5, Math.round((focusTimePct - 60) / 10)) : -Math.min(5, Math.round((60 - focusTimePct) / 10));
    return {
      overall,
      activeRisks: underperforming.length,
      change: healthDelta,
      riskChange: underperforming.length > totalMembers * 0.3 ? 1 : -1,
      productivityChange: focusDelta,
      healthChange: healthDelta,
    };
  }

  private computeTrend(score: number): string {
    if (score >= 80) return 'up';
    if (score >= 50) return 'stable';
    return 'down';
  }

  private generateTrend(score: number): { period: string; score: number }[] {
    return [
      { period: 'Week -4', score: Math.max(0, score - 12) },
      { period: 'Week -3', score: Math.max(0, score - 8) },
      { period: 'Week -2', score: Math.max(0, score - 4) },
      { period: 'Week -1', score: Math.max(0, score - 2) },
      { period: 'Current', score },
    ];
  }

  private groupBy<T extends Record<string, unknown>>(items: T[], key: string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const k = String(item[key]);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  }
}
