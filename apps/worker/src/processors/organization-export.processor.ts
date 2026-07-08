import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { StorageService } from '../../../api/src/modules/storage/storage.service';
import { NotificationsService } from '../../../api/src/modules/notifications/notifications.service';
import type { OrganizationExportJobData } from '../../../api/src/modules/organization/organization.service';

type DeptRow = {
  name: string;
  manager: { firstName: string; lastName: string } | null;
  _count: { users: number; projects: number };
};

type ProjectRow = {
  name: string;
  code: string;
  status: string;
  billable: boolean;
  department: { name: string } | null;
};

@Processor('organization-export')
export class OrganizationExportProcessor extends WorkerHost {
  private readonly logger = new Logger(OrganizationExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<OrganizationExportJobData>): Promise<{ key: string }> {
    const { tenantId, organizationId, format, actorId } = job.data;
    this.logger.log(`Organization export START format=${format} org=${organizationId}`);

    const [departments, projects] = await Promise.all([
      this.prisma.department.findMany({
        where: { tenantId, organizationId, deletedAt: null },
        include: {
          manager: { select: { firstName: true, lastName: true } },
          _count: { select: { users: true, projects: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.project.findMany({
        where: { tenantId, organizationId, deletedAt: null },
        include: { department: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);

    let buffer: Buffer;
    let ext: string;
    let contentType: string;

    if (format === 'CSV') {
      buffer = Buffer.from(buildCsv(departments, projects), 'utf-8');
      ext = 'csv';
      contentType = 'text/csv';
    } else if (format === 'EXCEL') {
      buffer = await buildExcel(departments, projects);
      ext = 'xlsx';
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      buffer = await buildPdf(departments, projects);
      ext = 'pdf';
      contentType = 'application/pdf';
    }

    const key = `exports/org-structure-${Date.now()}-${job.id}.${ext}`;
    await this.storage.put(key, buffer, { contentType });

    const url = await this.storage.signedUrl(key, 86_400);
    await this.notifications.create({
      tenantId,
      organizationId,
      userId: actorId,
      type: 'ANNOUNCEMENT',
      category: 'SYSTEM',
      title: 'Organization export ready',
      message: `Your ${format} organization structure export has finished generating.`,
      actionUrl: url,
      actionLabel: 'Download',
    });

    this.logger.log(`Organization export SUCCEEDED format=${format} key=${key}`);
    return { key };
  }
}

function buildCsv(departments: DeptRow[], projects: ProjectRow[]): string {
  const lines = ['Departments', 'Name,Manager,Staff Count,Project Count'];
  for (const d of departments) {
    const manager = d.manager ? `${d.manager.firstName} ${d.manager.lastName}` : '—';
    lines.push([`"${d.name}"`, `"${manager}"`, d._count.users, d._count.projects].join(','));
  }
  lines.push('', 'Projects', 'Name,Code,Department,Status,Billable');
  for (const p of projects) {
    lines.push(
      [`"${p.name}"`, p.code, `"${p.department?.name ?? '—'}"`, p.status, p.billable ? 'Yes' : 'No'].join(','),
    );
  }
  return lines.join('\n');
}

async function buildExcel(departments: DeptRow[], projects: ProjectRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TimeForge';
  workbook.created = new Date();

  const deptSheet = workbook.addWorksheet('Departments');
  deptSheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Manager', key: 'manager', width: 25 },
    { header: 'Staff Count', key: 'staff', width: 14 },
    { header: 'Project Count', key: 'projects', width: 14 },
  ];
  deptSheet.getRow(1).font = { bold: true };
  for (const d of departments) {
    deptSheet.addRow({
      name: d.name,
      manager: d.manager ? `${d.manager.firstName} ${d.manager.lastName}` : '—',
      staff: d._count.users,
      projects: d._count.projects,
    });
  }

  const projSheet = workbook.addWorksheet('Projects');
  projSheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Code', key: 'code', width: 15 },
    { header: 'Department', key: 'department', width: 25 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Billable', key: 'billable', width: 10 },
  ];
  projSheet.getRow(1).font = { bold: true };
  for (const p of projects) {
    projSheet.addRow({
      name: p.name,
      code: p.code,
      department: p.department?.name ?? '—',
      status: p.status,
      billable: p.billable ? 'Yes' : 'No',
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

async function buildPdf(departments: DeptRow[], projects: ProjectRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Organization Structure', { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text('Departments');
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const d of departments) {
      const manager = d.manager ? `${d.manager.firstName} ${d.manager.lastName}` : '—';
      doc.text(`${d.name} — Manager: ${manager} — Staff: ${d._count.users} — Projects: ${d._count.projects}`);
    }

    doc.moveDown();
    doc.fontSize(14).text('Projects');
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const p of projects) {
      doc.text(`${p.name} (${p.code}) — Dept: ${p.department?.name ?? '—'} — Status: ${p.status} — Billable: ${p.billable ? 'Yes' : 'No'}`);
    }

    doc.end();
  });
}
