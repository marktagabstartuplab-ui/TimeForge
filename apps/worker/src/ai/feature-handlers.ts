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

// ─── STANDUP_DRAFT ───────────────────────────────────────────────────────────
const standupDraft: FeatureHandler = async (prisma, ctx) => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const [entries, lastScrum, user] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null, startTime: { gte: startOfToday.toISOString(), lte: endOfToday.toISOString() } },
      orderBy: { startTime: 'asc' },
      select: { description: true, project: { select: { name: true } } },
    }),
    prisma.scrumEntry.findFirst({
      where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null },
      orderBy: { entryDate: 'desc' },
      select: { today: true },
    }),
    prisma.user.findFirst({
      where: { id: ctx.subjectId, tenantId: ctx.tenantId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const name = user ? `${user.firstName} ${user.lastName}` : ctx.subjectId;
  const taskDescriptions = entries.map(e => `[Project: ${e.project?.name ?? 'General'}] ${e.description}`).join('\n');
  const previousToday = lastScrum?.today ?? 'None';

  return {
    systemPrompt: `You are an assistant that drafts professional Daily Scrum standups. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }. In the "summary" field, write the drafted standup with three distinct sections: 'Yesterday', 'Today', and 'Blockers'. In the 'recommendation' field, write any tips or suggested focus points.`,
    userPrompt: `Draft a daily scrum standup for employee ${name}.\n\nTasks worked on today (to populate "Today" section):\n${taskDescriptions || 'No tasks logged today.'}\n\nWhat they listed as 'Today' in their last scrum (to populate "Yesterday" section):\n${previousToday}`,
  };
};

// ─── BLOCKER_ADVISORY ─────────────────────────────────────────────────────────
const blockerAdvisory: FeatureHandler = async (prisma, ctx) => {
  const blockerText = (ctx.options?.blockers as string) || '';
  const user = await prisma.user.findFirst({
    where: { id: ctx.subjectId, tenantId: ctx.tenantId },
    select: { firstName: true, lastName: true },
  });
  const name = user ? `${user.firstName} ${user.lastName}` : ctx.subjectId;

  return {
    systemPrompt: `You are a technical consultant and agile mentor. Analyze the blocker and provide 3 actionable, structured suggestions or steps to resolve it. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }. Place the structured suggestions in the "recommendation" field and a summary of the advice in the "summary" field.`,
    userPrompt: `User ${name} is blocked by:\n"${blockerText}"\n\nProvide troubleshooting steps or advice.`,
  };
};

// ─── KPI_COPILOT ─────────────────────────────────────────────────────────────
const kpiCopilot: FeatureHandler = async (prisma, ctx) => {
  const progress = await prisma.kpiProgress.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null },
    orderBy: { periodKey: 'desc' },
    take: 5,
    include: { kpiTemplate: { select: { name: true, targetValue: true, description: true } } },
  });

  const kpiRows = progress.map(p => 
    `KPI: ${p.kpiTemplate.name} | Target: ${p.kpiTemplate.targetValue} | Current: ${p.currentValue} | Period: ${p.periodKey}`
  ).join('\n');

  return {
    systemPrompt: `You are a career and performance advisor. Analyze the employee's KPI targets vs actual progress and suggest a practical action checklist to help them hit their targets. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }. Place the checklist in the "recommendation" field and a high-level summary in the "summary" field.`,
    userPrompt: `KPI Progress records:\n${kpiRows || 'No KPI progress recorded yet.'}`,
  };
};

// ─── INTERN_ADVISORY ──────────────────────────────────────────────────────────
const internAdvisory: FeatureHandler = async (prisma, ctx) => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [entries, user] = await Promise.all([
    prisma.scrumEntry.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.subjectId, deletedAt: null, entryDate: { gte: since } },
      orderBy: { entryDate: 'desc' },
      select: { today: true, blockers: true },
      take: 5,
    }),
    prisma.user.findFirst({
      where: { id: ctx.subjectId, tenantId: ctx.tenantId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const scrumText = entries.map(e => `Tasks: ${e.today}${e.blockers ? ` | Blocker: ${e.blockers}` : ''}`).join('\n');

  return {
    systemPrompt: `You are an intern mentor and technical advisor. Provide supportive feedback, soft skills advice, and suggestions for their tasks. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }. Place mentoring advice in the "recommendation" field and high-level summary in the "summary" field.`,
    userPrompt: `Intern ${user?.firstName ?? ''} has completed the following scrums recently:\n${scrumText || 'No scrum entries yet.'}`,
  };
};

// ─── IMPROVE_DESCRIPTION ─────────────────────────────────────────────────────
const improveDescription: FeatureHandler = async (prisma, ctx) => {
  const originalText = (ctx.options?.text as string) || '';

  // mode: 'task-plan' — instead of rewriting the text, derive the two required
  // Daily Scrum planning fields from it. Reuses this feature (same permission,
  // same admin toggle) because AiFeature is a DB enum — a new value would need
  // a prod migration for what is just a different prompt over the same input.
  // Field mapping on the client: summary -> Expected Output,
  // recommendation -> Measurement Criteria.
  if (ctx.options?.mode === 'task-plan') {
    return {
      systemPrompt: `You are an agile planning assistant. Given a task description, produce the two planning fields a Daily Scrum commitment needs. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }. In "summary", write the Expected Output — the concrete deliverable(s) this task should produce (1-2 sentences). In "recommendation", write the Measurement Criteria — how completion and quality will be objectively verified (1-2 sentences).`,
      userPrompt: `Task description:\n"${originalText}"`,
    };
  }

  return {
    systemPrompt: `You are a professional documentation assistant. Rewrite the task description to be clear, descriptive, professional, and outcome-oriented. Respond with JSON: { "summary": "...", "recommendation": "...", "confidence": 0.0-1.0 }. Place the improved, detailed description inside the "recommendation" field, and a brief description of the improvement in the "summary" field.`,
    userPrompt: `Rewrite this vague task description to be professional and detailed:\n"${originalText}"`,
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
  STANDUP_DRAFT:       standupDraft,
  BLOCKER_ADVISORY:    blockerAdvisory,
  KPI_COPILOT:         kpiCopilot,
  INTERN_ADVISORY:     internAdvisory,
  IMPROVE_DESCRIPTION: improveDescription,
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
