import { PrismaClient } from '@prisma/client';

export interface AiPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface AiJobContext {
  tenantId: string;
  feature: string;
  subjectId: string;
  subjectType: string;
  options: Record<string, unknown>;
  triggeredBy: string;
}

type FeatureHandler = (prisma: PrismaClient, ctx: AiJobContext) => Promise<AiPrompt>;

// ─── DAILY_SUMMARY ────────────────────────────────────────────────────────────
// Subject: user — summarises their last 7 days of scrum entries

const dailySummary: FeatureHandler = async (prisma, ctx) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [entries, user] = await Promise.all([
    prisma.scrumEntry.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null, entryDate: { gte: since } },
      orderBy: { entryDate: 'desc' },
      take: 7,
      select: { entryDate: true, yesterday: true, today: true, blockers: true, notes: true },
    }),
    prisma.user.findFirst({
      where: { id: ctx.subjectId, tenantId: ctx.tenantId },
      select: { firstName: true, lastName: true, employmentType: true },
    }),
  ]);

  const name = user ? `${user.firstName} ${user.lastName}` : ctx.subjectId;
  const entriesText = entries.map((e) =>
    `Date: ${e.entryDate.toISOString().slice(0, 10)}\n` +
    `Yesterday: ${e.yesterday}\nToday: ${e.today}\n` +
    (e.blockers ? `Blockers: ${e.blockers}\n` : '') +
    (e.notes    ? `Notes: ${e.notes}\n`    : ''),
  ).join('\n---\n');

  return {
    systemPrompt: `You are a team-performance analyst. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Produce a concise daily scrum summary for ${name} (${user?.employmentType ?? 'team member'}) based on their last 7 days of standup entries.\n\n${entriesText || 'No scrum entries found for this period.'}`,
  };
};

// ─── WEEKLY_SUMMARY ───────────────────────────────────────────────────────────
// Subject: user — weekly timesheet + scrum roll-up

const weeklySummary: FeatureHandler = async (prisma, ctx) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [timesheet, entries, user] = await Promise.all([
    prisma.timesheet.findFirst({
      where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null, periodStart: { gte: since } },
      orderBy: { periodStart: 'desc' },
      select: { status: true, totalMinutes: true, periodStart: true, periodEnd: true },
    }),
    prisma.scrumEntry.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null, entryDate: { gte: since } },
      orderBy: { entryDate: 'asc' },
      select: { entryDate: true, yesterday: true, today: true, blockers: true },
    }),
    prisma.user.findFirst({
      where: { id: ctx.subjectId, tenantId: ctx.tenantId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const name = user ? `${user.firstName} ${user.lastName}` : ctx.subjectId;
  const hours = timesheet ? (timesheet.totalMinutes / 60).toFixed(1) : '0';
  const tsStatus = timesheet?.status ?? 'No timesheet';

  return {
    systemPrompt: `You are a workforce analyst. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Weekly summary for ${name}.\nTimesheet: ${hours}h logged, status=${tsStatus}.\n\nScrum entries:\n${
      entries.map((e) => `${e.entryDate.toISOString().slice(0, 10)}: ${e.today}${e.blockers ? ` | BLOCKER: ${e.blockers}` : ''}`).join('\n') || 'None'
    }`,
  };
};

// ─── TIMESHEET_SUMMARY ────────────────────────────────────────────────────────
// Subject: timesheet — summarise entries for review

const timesheetSummary: FeatureHandler = async (prisma, ctx) => {
  const timesheet = await prisma.timesheet.findFirst({
    where: { id: ctx.subjectId, tenantId: ctx.tenantId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true } },
      entries: {
        select: { startTime: true, durationMinutes: true, description: true, project: { select: { name: true } } },
        orderBy: { startTime: 'asc' },
        take: 50,
      },
    },
  });

  if (!timesheet) return {
    systemPrompt: `You are a payroll analyst. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Timesheet ${ctx.subjectId} not found.`,
  };

  const name = `${timesheet.user.firstName} ${timesheet.user.lastName}`;
  const hours = (timesheet.totalMinutes / 60).toFixed(1);
  const entries = timesheet.entries.map((e) =>
    `${e.startTime.toISOString().slice(0, 10)} ${((e.durationMinutes ?? 0) / 60).toFixed(1)}h [${e.project?.name ?? 'no project'}] ${e.description ?? ''}`
  ).join('\n');

  return {
    systemPrompt: `You are a timesheet auditor. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Summarise timesheet for ${name}. Period: ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)}. Total: ${hours}h. Status: ${timesheet.status}.\n\nEntries:\n${entries || 'None'}`,
  };
};

// ─── BLOCKER_DETECTION ────────────────────────────────────────────────────────
// Subject: user — detect recurring or unresolved blockers

const blockerDetection: FeatureHandler = async (prisma, ctx) => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [blocked, user] = await Promise.all([
    prisma.scrumEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.subjectId,
        deletedAt: null,
        entryDate: { gte: since },
        blockers: { not: null },
      },
      orderBy: { entryDate: 'desc' },
      select: { entryDate: true, blockers: true, today: true },
    }),
    prisma.user.findFirst({
      where: { id: ctx.subjectId, tenantId: ctx.tenantId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const name = user ? `${user.firstName} ${user.lastName}` : ctx.subjectId;
  const blockerList = blocked.map((e) =>
    `${e.entryDate.toISOString().slice(0, 10)}: ${e.blockers}`
  ).join('\n');

  return {
    systemPrompt: `You are an agile coach. Identify recurring or high-impact blockers. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Analyse blockers reported by ${name} over the last 14 days.\n\n${blockerList || 'No blockers reported in this period.'}`,
  };
};

// ─── KPI_ANALYSIS ────────────────────────────────────────────────────────────
// Subject: kpi_template — analyse progress across team

const kpiAnalysis: FeatureHandler = async (prisma, ctx) => {
  const [template, progress] = await Promise.all([
    prisma.kpiTemplate.findFirst({
      where: { id: ctx.subjectId, tenantId: ctx.tenantId, deletedAt: null },
      select: { name: true, metricType: true, period: true, targetValue: true, description: true },
    }),
    prisma.kpiProgress.findMany({
      where: { tenantId: ctx.tenantId, kpiTemplateId: ctx.subjectId, deletedAt: null },
      orderBy: { periodKey: 'desc' },
      take: 20,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const target = template?.targetValue ?? 0;
  const rows = progress.map((p) => {
    const pct = Number(target) > 0 ? ((Number(p.currentValue) / Number(target)) * 100).toFixed(0) : 'N/A';
    return `${p.user.firstName} ${p.user.lastName} | Period: ${p.periodKey} | ${p.currentValue}/${target} (${pct}%)`;
  }).join('\n');

  return {
    systemPrompt: `You are a performance analytics engine. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `KPI: ${template?.name ?? ctx.subjectId} (${template?.metricType}, period=${template?.period}, target=${target}).\nDescription: ${template?.description ?? 'N/A'}\n\nProgress:\n${rows || 'No progress records found.'}`,
  };
};

// ─── PRODUCTIVITY_INSIGHT ─────────────────────────────────────────────────────
// Subject: user (supervisor) — team productivity summary

const productivityInsight: FeatureHandler = async (prisma, ctx) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const teamUsers = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId, supervisorId: ctx.subjectId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  const userIds = [ctx.subjectId, ...teamUsers.map((u) => u.id)];

  const timeGroups = await prisma.timeEntry.groupBy({
    by: ['userId'],
    where: { tenantId: ctx.tenantId, userId: { in: userIds }, startTime: { gte: since }, deletedAt: null },
    _sum: { durationMinutes: true },
    _count: { id: true },
  });

  const userMap = new Map(teamUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const rows = timeGroups.map((r) => {
    const hrs = ((r._sum.durationMinutes ?? 0) / 60).toFixed(1);
    return `${userMap.get(r.userId) ?? r.userId}: ${hrs}h (${r._count.id} entries)`;
  }).join('\n');

  return {
    systemPrompt: `You are a productivity analyst. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Team productivity report (last 30 days, ${teamUsers.length} members):\n\n${rows || 'No time entries found.'}`,
  };
};

// ─── SUPERVISOR_ADVISORY ──────────────────────────────────────────────────────
// Subject: user (supervisor) — holistic team health advisory

const supervisorAdvisory: FeatureHandler = async (prisma, ctx) => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const teamUsers = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId, supervisorId: ctx.subjectId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  const userIds = teamUsers.map((u) => u.id);

  const [timesheetsByUser, blockers, pendingCount] = await Promise.all([
    prisma.timesheet.groupBy({
      by: ['userId', 'status'],
      where: { tenantId: ctx.tenantId, userId: { in: userIds }, deletedAt: null, periodStart: { gte: since } },
      _count: { id: true },
    }),
    prisma.scrumEntry.findMany({
      where: { tenantId: ctx.tenantId, userId: { in: userIds }, deletedAt: null, entryDate: { gte: since }, blockers: { not: null } },
      select: { userId: true, entryDate: true, blockers: true },
      orderBy: { entryDate: 'desc' },
      take: 20,
    }),
    prisma.timesheet.count({
      where: { tenantId: ctx.tenantId, userId: { in: userIds }, status: 'SUBMITTED', deletedAt: null },
    }),
  ]);

  const userMap = new Map(teamUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const tsRows = timesheetsByUser
    .map((r) => `${userMap.get(r.userId) ?? r.userId}: ${r.status} x${r._count.id}`)
    .join('\n');

  const blockerRows = blockers
    .map((b) => `${userMap.get(b.userId) ?? b.userId} (${b.entryDate.toISOString().slice(0, 10)}): ${b.blockers}`)
    .join('\n');

  return {
    systemPrompt: `You are an executive workforce advisor. Provide a team health summary and actionable recommendations. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Team health advisory (last 14 days, ${teamUsers.length} direct reports).\n\nPending approvals: ${pendingCount}\n\nTimesheet status:\n${tsRows || 'None'}\n\nReported blockers:\n${blockerRows || 'None'}`,
  };
};

// ─── PAYROLL_VALIDATION ───────────────────────────────────────────────────────
// Subject: payroll_period — validate line items for anomalies

const payrollValidation: FeatureHandler = async (prisma, ctx) => {
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: ctx.subjectId, tenantId: ctx.tenantId },
    include: {
      reports: {
        include: {
          lineItems: {
            include: { user: { select: { firstName: true, lastName: true, employmentType: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!period || !period.reports.length) {
    return {
      systemPrompt: `You are a payroll auditor. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
      userPrompt: `Payroll period ${ctx.subjectId} has no report to validate yet.`,
    };
  }

  const report = period.reports[0];
  const lines = report.lineItems.map((li) => {
    const name = `${li.user.firstName} ${li.user.lastName}`;
    return `${name} [${li.user.employmentType}]: approved=${li.approvedHours}h, pending=${li.pendingHours}h, overtime=${li.overtimeHours}h, rate=₱${li.hourlyRate}, estPay=₱${li.estimatedPay}`;
  });

  // Flag outliers (overtime > 20h or pending > approved)
  const flags = report.lineItems.filter(
    (li) => Number(li.overtimeHours) > 20 || Number(li.pendingHours) > Number(li.approvedHours),
  ).map((li) => `${li.user.firstName} ${li.user.lastName}: overtime=${li.overtimeHours}h, pending=${li.pendingHours}h`);

  return {
    systemPrompt: `You are a payroll compliance auditor. Check for anomalies, duplicate entries, unusual overtime, and data integrity. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
    userPrompt: `Payroll period: ${period.startDate.toISOString().slice(0, 10)} – ${period.endDate.toISOString().slice(0, 10)} | Status: ${period.status} | Type: ${period.type}\n\nLine items (${lines.length}):\n${lines.join('\n')}\n\nPre-flagged anomalies:\n${flags.join('\n') || 'None detected by rule checks.'}`,
  };
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const HANDLERS: Record<string, FeatureHandler> = {
  DAILY_SUMMARY:       dailySummary,
  WEEKLY_SUMMARY:      weeklySummary,
  TIMESHEET_SUMMARY:   timesheetSummary,
  BLOCKER_DETECTION:   blockerDetection,
  KPI_ANALYSIS:        kpiAnalysis,
  PRODUCTIVITY_INSIGHT: productivityInsight,
  SUPERVISOR_ADVISORY: supervisorAdvisory,
  PAYROLL_VALIDATION:  payrollValidation,
};

export function getFeatureHandler(feature: string): FeatureHandler {
  const handler = HANDLERS[feature];
  if (!handler) {
    // Fallback for unknown features
    return async (_prisma, ctx) => ({
      systemPrompt: `You are a workforce analytics AI. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }`,
      userPrompt: `Perform AI analysis for feature "${ctx.feature}" on subject ${ctx.subjectType}:${ctx.subjectId}.`,
    });
  }
  return handler;
}
